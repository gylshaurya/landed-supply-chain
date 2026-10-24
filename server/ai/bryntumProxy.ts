import { aiMode, aiProvider, config } from '../config.js';
import { anthropic, FALLBACK } from './client.js';
import { geminiChain, markHealthy } from './llm.js';

// Backend for Bryntum's built-in AI feature (AnthropicPlugin). The plugin sends
// a Messages API body; we pin the model, strip parameters the current model
// rejects, and forward it with the server-held key.

type Body = Record<string, unknown> & { tool_choice?: { type?: string } };

export async function bryntumPrompt(body: Body) {
  if (aiMode() === 'demo') {
    return {
      id: 'demo',
      type: 'message',
      role: 'assistant',
      model: config.model,
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'The Copilot needs a GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to edit the schedule. Everything else in Landed works in demo mode.' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
  if (aiProvider() === 'gemini') return geminiPrompt(body);
  const { temperature: _t, top_p: _p, top_k: _k, stream: _s, model: _m, thinking: _th, ...rest } = body;
  const params = { ...rest, model: config.model, max_tokens: Math.max(Number(rest.max_tokens ?? 0), 8000), output_config: { effort: 'low' as const } } as Body;
  if (params.tool_choice && (params.tool_choice.type === 'any' || params.tool_choice.type === 'tool')) params.tool_choice = { type: 'auto' };
  const request = { ...params, cache_control: { type: 'ephemeral' }, ...FALLBACK } as unknown as Parameters<ReturnType<typeof anthropic>['beta']['messages']['create']>[0];
  const msg = await anthropic().beta.messages.create({ ...request, stream: false });
  return msg;
}

/** Bryntum's GooglePlugin sends a Gemini REST generateContent body; forward it with the server-held key. */
async function geminiPrompt(body: Body) {
  const { model: _m, stream: _s, ...rest } = body;
  const models = geminiChain();
  let last: { status: number; message: string } = { status: 500, message: 'Gemini unavailable' };
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey }, body: JSON.stringify(rest), signal: AbortSignal.timeout(60_000) });
      const json = await res.json();
      if (res.ok) {
        markHealthy(model);
        return json;
      }
      last = { status: res.status, message: json?.error?.message ?? `Gemini error ${res.status}` };
      if (!(res.status === 429 || res.status === 503)) throw Object.assign(new Error(last.message), { status: res.status });
      await new Promise(r => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
  throw Object.assign(new Error(last.message), { status: last.status });
}
