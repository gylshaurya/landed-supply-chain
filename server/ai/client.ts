import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { config } from '../config.js';

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: config.anthropicKey,
      defaultHeaders: config.anthropicWorkspace ? { 'anthropic-workspace-id': config.anthropicWorkspace } : undefined,
    });
  }
  return client;
}

/** Server-side refusal fallback: routed by the API, no model list to maintain. */
export const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

export class AIRefusal extends Error {}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** One structured-output call validated against a Zod schema. */
export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const msg = await anthropic().beta.messages.parse({
    model: config.model,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: 'user', content: opts.content }],
    output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? 'medium' },
    ...FALLBACK,
  });
  if (msg.stop_reason === 'refusal') throw new AIRefusal('The model declined this request.');
  if (msg.parsed_output == null) throw new Error(`Model returned no parseable output (stop_reason=${msg.stop_reason})`);
  return msg.parsed_output as z.infer<S>;
}
