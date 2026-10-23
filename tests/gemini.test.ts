import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Scripted Gemini responses: the agent loop must run tools (incl. parallel calls),
// return function responses, and stop once submit_plan is called.
const calls: any[] = [];
const script = [
  { functionCalls: [{ id: '1', name: 'get_situation', args: {} }] },
  {
    functionCalls: [
      { id: '2', name: 'simulate_option', args: { label: 'Wait it out', useSupplierOvertime: false, airUnits: 0, goodwillCredit: 0 } },
      { id: '3', name: 'simulate_option', args: { label: 'Overtime + air 160', useSupplierOvertime: true, airUnits: 160, goodwillCredit: 5 } },
    ],
  },
  {
    functionCalls: [
      {
        id: '4',
        name: 'submit_plan',
        args: {
          recommendedLabel: 'Overtime + air 160',
          headline: 'Pay overtime and fly 160 units.',
          rationale: 'Cheapest option that ships before Black Friday.',
          customerNoticeSubject: 'Update on your pre-order',
          customerNoticeBody: 'Hi {{name}}, order {{order_id}} now ships {{revised_date}} (was {{original_date}}). Keep: {{keep_link}}',
          supplierMessage: 'Approved.',
          goodwillCredit: 5,
        },
      },
    ],
  },
];

vi.mock('@google/genai', () => {
  class ApiError extends Error {
    status = 0;
  }
  class GoogleGenAI {
    models = {
      generateContent: async (req: any) => {
        calls.push(req);
        if (req.config?.responseJsonSchema) {
          return { text: JSON.stringify({ kind: 'delay', affectedTaskId: '1042-prod', delayDays: 12, reason: 'Kiln failure', offer: { overtimeDays: 5, overtimeCost: 1800 }, confidence: 0.9 }) };
        }
        const step = script[calls.filter(c => !c.config?.responseJsonSchema).length - 1];
        return { functionCalls: step.functionCalls, candidates: [{ content: { role: 'model', parts: step.functionCalls.map(fc => ({ functionCall: fc })) } }] };
      },
    };
  }
  return { GoogleGenAI, ApiError };
});

const { config } = await import('../server/config');
const { geminiSchema } = await import('../server/ai/llm');
const { buildSeed } = await import('../server/seed/data');
const { useDb } = await import('../server/db');
const svc = await import('../server/services');

describe('Gemini provider', () => {
  afterEach(() => {
    config.geminiKey = '';
  });

  it('produces a Gemini-compatible JSON schema (no $schema / additionalProperties, nullable kept)', () => {
    const s = geminiSchema(z.object({ a: z.string(), offer: z.object({ d: z.number() }).nullable() }));
    const text = JSON.stringify(s);
    expect(text).not.toContain('$schema');
    expect(text).not.toContain('additionalProperties');
    expect(text).toContain('null');
  });

  it('runs the recovery agent end to end on Gemini function calling', async () => {
    config.geminiKey = 'test-key';
    useDb(buildSeed());
    const { proposal, parsed } = await svc.handleSupplierUpdate('PO-1042', 'Kiln broke, 12 more days; $1,800 overtime saves 5 days.');
    expect(parsed.source).toBe('live');
    expect(proposal!.source).toBe('live');
    expect(proposal!.options.map(o => o.label)).toEqual(['Wait it out', 'Overtime + air 160']);
    expect(proposal!.agentTrace.map(t => t.tool)).toEqual(['get_situation', 'simulate_option', 'simulate_option', 'submit_plan']);
    // compliance language was enforced on the model's draft (it had no cancel option)
    expect(proposal!.ftcChecks.every(c => c.ok)).toBe(true);
    // the parallel simulate calls were answered in a single user turn
    const agentCalls = calls.filter(c => !c.config?.responseJsonSchema);
    const turns = agentCalls.at(-1).contents as any[];
    expect(turns.some(t => t.role === 'user' && t.parts.filter((p: any) => p.functionResponse).length === 2)).toBe(true);
    // model turns are sent back unchanged (Gemini thought signatures stay valid)
    expect(turns.filter(t => t.role === 'model').length).toBe(3);
  });
});
