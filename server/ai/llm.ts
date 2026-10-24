import { GoogleGenAI, ApiError, type Content, type Part } from '@google/genai';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config, aiProvider } from '../config.js';
import { anthropic, AIRefusal, FALLBACK, structured as claudeStructured } from './client.js';

// Provider-neutral layer: the agents describe what they need (structured
// output, or a tool-using loop) and this file talks to Gemini or Claude.

export type InputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }
  | { type: 'pdf'; data: string };

type Effort = 'low' | 'medium' | 'high';

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>) => Promise<string>;
}

export const tool = <S extends z.ZodType>(t: AgentTool<S>) => t as unknown as AgentTool;

let gemini: GoogleGenAI | null = null;
function geminiClient() {
  if (!gemini) gemini = new GoogleGenAI({ apiKey: config.geminiKey });
  return gemini;
}

export function modelName() {
  return aiProvider() === 'gemini' ? config.geminiModel : config.model;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const retryable = (e: unknown) => {
  const status = e instanceof ApiError ? e.status : 0;
  return status === 429 || status === 500 || status === 503 || status === 504 || /timed? ?out|aborted|fetch failed/i.test(String((e as Error)?.message));
};

/**
 * Calls Gemini with retries and model fallback. Free-tier models are often
 * briefly overloaded (503) or rate limited (429): back off, then move down the
 * fallback list. `session.model` makes the choice sticky for a multi-turn
 * agent so a conversation stays on one model once it has started.
 */
async function generate(params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>, label: string, session: { model?: string; started?: boolean } = {}) {
  const chain = session.model ? [session.model] : [config.geminiModel, ...config.geminiFallbacks.filter(m => m !== config.geminiModel)];
  let lastError: unknown;
  for (const model of chain) {
    const attempts = session.started ? 6 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await geminiClient().models.generateContent({ ...params, model, config: { ...params.config, httpOptions: { timeout: 90_000 } } });
        if (!session.model) console.log(`[gemini] ${label} → ${model}`);
        session.model = model;
        session.started = true;
        return res;
      } catch (e) {
        lastError = e;
        if (!retryable(e)) throw e;
        const hinted = /retry in ([\d.]+)s/i.exec((e as Error).message)?.[1];
        const wait = hinted ? Math.min(30_000, Math.ceil(Number(hinted) * 1000) + 500) : 2500 * (attempt + 1);
        console.warn(`[gemini] ${label} on ${model}: ${(e as ApiError).status ?? 'error'} — ${attempt + 1 < attempts ? `retrying in ${Math.round(wait / 1000)}s` : 'trying next model'}`);
        if (attempt + 1 < attempts) await sleep(wait);
      }
    }
  }
  throw lastError;
}

function toGeminiParts(content: InputPart[] | string): Part[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map(p =>
    p.type === 'text' ? { text: p.text } : p.type === 'image' ? { inlineData: { mimeType: p.mimeType, data: p.data } } : { inlineData: { mimeType: 'application/pdf', data: p.data } },
  );
}

function toClaudeContent(content: InputPart[] | string) {
  if (typeof content === 'string') return content;
  return content.map(p =>
    p.type === 'text'
      ? { type: 'text' as const, text: p.text }
      : p.type === 'image'
        ? { type: 'image' as const, source: { type: 'base64' as const, media_type: p.mimeType as 'image/png', data: p.data } }
        : { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: p.data } },
  );
}

/** JSON schema for Gemini: inline everything and drop keys its schema subset rejects. */
export function geminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7', reused: 'inline' }) as Record<string, unknown>;
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema' || k === 'additionalProperties' || k === '$id') continue;
      out[k] = clean(v);
    }
    return out;
  };
  return clean(json) as Record<string, unknown>;
}

/** One call whose answer must validate against `schema`. */
export async function structured<S extends z.ZodType>(opts: { schema: S; system: string; content: InputPart[] | string; effort?: Effort }): Promise<z.infer<S>> {
  if (aiProvider() === 'anthropic') {
    return claudeStructured({ schema: opts.schema, system: opts.system, content: toClaudeContent(opts.content) as never, effort: opts.effort });
  }
  const res = await generate(
    {
      contents: [{ role: 'user', parts: toGeminiParts(opts.content) }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: 'application/json',
        responseJsonSchema: geminiSchema(opts.schema),
        maxOutputTokens: 16000,
      },
    },
    'structured',
  );
  const text = res.text ?? '';
  if (!text) throw new AIRefusal(`Gemini returned no output (finish reason: ${res.candidates?.[0]?.finishReason ?? 'unknown'})`);
  const parsed = opts.schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Gemini output did not match the schema: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

/**
 * Tool-using agent loop. Stops when `isDone()` returns true or the model
 * stops calling tools.
 */
export async function runToolAgent(opts: { system: string; prompt: string; tools: AgentTool[]; maxIterations?: number; isDone: () => boolean }) {
  const max = opts.maxIterations ?? 16;
  if (aiProvider() === 'anthropic') {
    const runner = anthropic().beta.messages.toolRunner({
      model: config.model,
      max_tokens: 16000,
      max_iterations: max,
      system: opts.system,
      output_config: { effort: 'medium' },
      tools: opts.tools.map(t => betaZodTool({ name: t.name, description: t.description, inputSchema: t.schema, run: input => t.run(input) })),
      messages: [{ role: 'user', content: opts.prompt }],
      ...FALLBACK,
    });
    for await (const message of runner) {
      if (message.stop_reason === 'refusal') throw new AIRefusal('The agent declined this request.');
      if (opts.isDone()) break;
    }
    return;
  }

  const declarations = opts.tools.map(t => ({ name: t.name, description: t.description, parametersJsonSchema: geminiSchema(t.schema) }));
  const contents: Content[] = [{ role: 'user', parts: [{ text: opts.prompt }] }];
  const session: { model?: string; started?: boolean } = {};
  for (let i = 0; i < max && !opts.isDone(); i++) {
    const started = Date.now();
    const res = await generate({ contents, config: { systemInstruction: opts.system, tools: [{ functionDeclarations: declarations }], maxOutputTokens: 16000 } }, 'agent', session);
    const modelContent = res.candidates?.[0]?.content;
    const calls = res.functionCalls ?? [];
    if (process.env.LANDED_DEBUG_AI) console.log(`[gemini] turn ${i}: ${Date.now() - started}ms, finish=${res.candidates?.[0]?.finishReason}, calls=${calls.map(c => c.name).join(',') || 'none'}`);
    if (!modelContent || !calls.length) {
      // Nudge once if the model answered in prose instead of submitting.
      if (i < max - 1 && !opts.isDone()) {
        if (modelContent) contents.push(modelContent);
        contents.push({ role: 'user', parts: [{ text: 'Use the tools: finish by calling submit_plan with your recommendation.' }] });
        continue;
      }
      break;
    }
    // Send the model turn back unchanged (keeps Gemini's thought signatures valid).
    contents.push(modelContent);
    const responses: Part[] = [];
    for (const call of calls) {
      const t = opts.tools.find(x => x.name === call.name);
      let result: string;
      if (!t) result = `Error: unknown tool ${call.name}`;
      else {
        const parsed = t.schema.safeParse(call.args ?? {});
        result = parsed.success ? await t.run(parsed.data) : `Error: invalid arguments — ${parsed.error.message.slice(0, 300)}`;
      }
      responses.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
}
