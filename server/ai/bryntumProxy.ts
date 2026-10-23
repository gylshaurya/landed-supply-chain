import { aiMode, config } from '../config.js';
import { anthropic, FALLBACK } from './client.js';

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
      content: [{ type: 'text', text: 'The Copilot needs an ANTHROPIC_API_KEY to edit the schedule. Everything else in Landed works in demo mode.' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
  const { temperature: _t, top_p: _p, top_k: _k, stream: _s, model: _m, thinking: _th, ...rest } = body;
  const params = { ...rest, model: config.model, max_tokens: Math.max(Number(rest.max_tokens ?? 0), 8000), output_config: { effort: 'low' as const } } as Body;
  if (params.tool_choice && (params.tool_choice.type === 'any' || params.tool_choice.type === 'tool')) params.tool_choice = { type: 'auto' };
  const request = { ...params, cache_control: { type: 'ephemeral' }, ...FALLBACK } as unknown as Parameters<ReturnType<typeof anthropic>['beta']['messages']['create']>[0];
  const msg = await anthropic().beta.messages.create({ ...request, stream: false });
  return msg;
}
