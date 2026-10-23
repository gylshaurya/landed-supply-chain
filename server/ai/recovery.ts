import { z } from 'zod';
import { aiMode, today } from '../config.js';
import { fmt } from '../dates.js';
import { bus } from '../bus.js';
import { BLACK_FRIDAY } from '../seed/data.js';
import { AIR_CAPACITY, bestOption, evaluateScenario, scheduled, suggestedAirUnits } from '../sim.js';
import type { DB, OptionResult, Proposal } from '../types.js';
import { runToolAgent, structured, tool } from './llm.js';
import { demoSupplierUpdate, demoRecovery } from './fixtures.js';
import { enforceCompliance, ftcChecks } from './notice.js';

// ---------------------------------------------------------------------------
// 1. Understand the supplier's message
// ---------------------------------------------------------------------------

export const SupplierUpdateSchema = z.object({
  kind: z.enum(['delay', 'on_track', 'quality_issue', 'other']),
  affectedTaskId: z.string().describe('id of the task the update is about, from the provided task list'),
  delayDays: z.number().int().describe('calendar days of slip; 0 if none'),
  reason: z.string().describe('one short sentence, plain English'),
  offer: z
    .object({ overtimeDays: z.number().int(), overtimeCost: z.number() })
    .nullable()
    .describe('a paid option the supplier offered to recover time, if any'),
  confidence: z.number().describe('0-1'),
});
export type SupplierUpdate = z.infer<typeof SupplierUpdateSchema>;

export async function parseSupplierUpdate(db: DB, poId: string, message: string): Promise<SupplierUpdate & { source: 'live' | 'demo' }> {
  if (aiMode() === 'demo') return { ...demoSupplierUpdate(poId, message), source: 'demo' };
  const tasks = scheduled(db).filter(t => t.poId === poId && t.kind !== 'group');
  const list = tasks.map(t => `- ${t.id}: ${t.name} (${t.computedStart} → ${t.computedEnd}, ${t.percentDone}% done)`).join('\n');
  const out = await structured({
    schema: SupplierUpdateSchema,
    effort: 'low',
    system:
      'You read messages from overseas suppliers (often written in a second language) and turn them into a structured schedule event for a small e-commerce brand. Be literal: only report an offer if the supplier actually proposed one, and convert weeks to days.',
    content: `Today is ${today()}. Purchase order ${poId} has these tasks:\n${list}\n\nSupplier message:\n"""${message}"""`,
  });
  return { ...out, source: 'live' };
}

// ---------------------------------------------------------------------------
// 2. The recovery agent
// ---------------------------------------------------------------------------

const SubmitSchema = z.object({
  recommendedLabel: z.string().describe('label of the simulated option you recommend, exactly as passed to simulate_option'),
  headline: z.string().describe('one sentence a busy founder reads first, with the key number'),
  rationale: z.string().describe('3-5 sentences: why this beats the alternatives, using the simulated numbers'),
  customerNoticeSubject: z.string(),
  customerNoticeBody: z
    .string()
    .describe('Email template for affected pre-order customers. Must use placeholders {{name}}, {{order_id}}, {{original_date}}, {{revised_date}}, {{keep_link}}, {{cancel_link}}. Warm, honest, short.'),
  supplierMessage: z.string().describe('short message back to the supplier confirming what you need from them'),
  goodwillCredit: z.number().describe('USD refunded to each customer who chooses to wait, 0 for none'),
});

export interface RecoveryResult {
  proposal: Omit<Proposal, 'id' | 'createdAt' | 'status'>;
}

const SYSTEM = `You are Landed's supply-chain recovery agent working for a small e-commerce brand that takes payments with PayPal.
A supplier delay just broke the plan. Your job: find the response that protects the most money and customer trust, then hand the founder a decision they can approve in one click.

How to work:
- Call get_situation first.
- You may call simulate_option several times in one turn to compare options side by side.
- Explore with simulate_option. Always simulate "Wait it out" (no action) as the reference. If the supplier offered paid overtime, try it alone and combined with air freight. Air cargo space is limited, so try a few air quantities up to the cap — numbers beat intuition. Try a goodwill credit of $5 only if customers will still be late.
- Compare on total impact (lost revenue + expected refunds + extra costs + broken-promise cost, i.e. support load and PayPal item-not-received dispute risk). Also weigh hitting Black Friday and the number of customers who get a broken promise.
- The FTC Mail Order Rule requires that customers whose promised date slips get a notice with the revised date and a free option to cancel for a full refund. Write that notice as a template with the required placeholders. Do not promise anything the plan does not deliver.
- Finish by calling submit_plan exactly once. Keep text plain and specific; no markdown headings.`;

export async function runRecoveryAgent(
  db: DB,
  poId: string,
  update: SupplierUpdate & { message: string },
  onTrace: (t: { tool: string; input: unknown; summary: string }) => void,
): Promise<RecoveryResult> {
  const po = db.purchaseOrders.find(o => o.id === poId)!;
  const product = db.products.find(p => p.id === po.productId)!;
  const baseline = evaluateScenario(db, { poId }, 'Original plan');
  const results = new Map<string, OptionResult>();
  const trace: Proposal['agentTrace'] = [];
  const emit = (t: { tool: string; input: unknown; summary: string }) => {
    trace.push(t);
    onTrace(t);
  };

  const simulate = (label: string, overtimeDays: number, airUnits: number, goodwillCredit: number) => {
    const offer = update.offer;
    const ot = offer && overtimeDays > 0 ? offer.overtimeDays : 0;
    const res = evaluateScenario(
      db,
      { poId, delayTaskId: update.affectedTaskId, delayDays: update.delayDays, overtimeDays: ot, overtimeCost: ot ? offer!.overtimeCost : 0, airUnits, goodwillCredit },
      label,
    );
    const { plan: _plan, shipDates: _s, ...rest } = res;
    results.set(label, rest);
    return rest;
  };

  if (aiMode() === 'demo') {
    const demo = demoRecovery(db, poId, update, simulate, emit);
    return finalize(db, poId, update, baseline.firstShipDate, results, demo, trace, 'demo');
  }

  const tools = [
    tool({
      name: 'get_situation',
      description: 'Current plan, the delay event, pre-orders, demand and key dates for the affected purchase order.',
      schema: z.object({}),
      run: async () => {
        const preUnits = db.preorders.filter(p => p.productId === product.id && (p.status === 'active' || p.status === 'kept')).reduce((s, p) => s + p.qty, 0);
        const out = {
          today: today(),
          blackFriday: BLACK_FRIDAY,
          purchaseOrder: { id: po.id, quantity: po.quantity, unitCost: po.unitCost, route: `${po.originPort} → ${po.destinationPort}`, mode: po.shipMode },
          product: { name: product.name, price: product.price, stockOnHand: product.stockOnHand, baselineDailyDemand: product.dailyVelocity, demandModel: 'baseline × 1.4 the week before Black Friday, × 4 Black Friday→Cyber Monday, × 1.8 until Dec 18; 45% of out-of-stock demand converts to pre-orders' },
          openPreorders: { count: db.preorders.filter(p => p.productId === product.id && (p.status === 'active' || p.status === 'kept')).length, units: preUnits, promisedShipDate: product.promisedShipDate },
          delay: { task: update.affectedTaskId, days: update.delayDays, reason: update.reason, supplierOffer: update.offer, supplierMessage: update.message },
          originalPlan: { firstShipDate: baseline.firstShipDate, totalImpact: baseline.totalImpact, note: 'totalImpact of the original plan is the unavoidable baseline (current stock-out); judge options by their increase over it' },
          airFreight: { costPerUnit: 7.8, fixedCost: 450, transitDays: 5, maxUnitsBeforeBlackFriday: AIR_CAPACITY, note: `peak-season cargo space: the forwarder can only confirm ${AIR_CAPACITY} units on flights before Black Friday; air units leave right after QC + balance payment; the rest go by sea` },
          suggestedAirUnits: suggestedAirUnits(db, product.id),
        };
        emit({ tool: 'get_situation', input: {}, summary: `${out.openPreorders.count} pre-orders promised ${fmt(product.promisedShipDate)}; ${update.delayDays ? `supplier slip ${update.delayDays} days` : 'timeline edited by hand'}` });
        return JSON.stringify(out);
      },
    }),
    tool({
      name: 'simulate_option',
      description: 'Re-run the schedule engine and demand model for one recovery option. Returns ship dates, late pre-orders, lost revenue, expected refunds, costs and total impact in USD.',
      schema: z.object({
        label: z.string().describe('short human label, e.g. "Air-freight 120 units"'),
        useSupplierOvertime: z.boolean().describe('accept the supplier overtime offer (if one exists)'),
        airUnits: z.number().int().min(0).max(AIR_CAPACITY).describe(`units to split off and send by air (max ${AIR_CAPACITY}: confirmed cargo space)`),
        goodwillCredit: z.number().min(0).max(20).describe('USD refunded to each late customer who keeps their order'),
      }),
      run: async input => {
        const r = simulate(input.label, input.useSupplierOvertime ? 1 : 0, input.airUnits, input.goodwillCredit);
        emit({
          tool: 'simulate_option',
          input,
          summary: `${input.label}: first ship ${fmt(r.firstShipDate)}, ${r.preordersLate} late, impact $${r.totalImpact.toLocaleString()} (+$${(r.totalImpact - baseline.totalImpact).toLocaleString()} vs plan)`,
        });
        return JSON.stringify({ ...r, increaseVsOriginalPlan: r.totalImpact - baseline.totalImpact });
      },
    }),
    tool({
      name: 'submit_plan',
      description: 'Submit the final recommendation. Call once, after simulating.',
      schema: SubmitSchema,
      run: async input => {
        if (!results.has(input.recommendedLabel)) return `Error: no simulated option labelled "${input.recommendedLabel}". Use one of: ${[...results.keys()].join(', ')}`;
        submitted = input;
        emit({ tool: 'submit_plan', input: { recommendedLabel: input.recommendedLabel }, summary: input.headline });
        return 'Plan submitted for founder approval.';
      },
    }),
  ];

  let submitted: z.infer<typeof SubmitSchema> | null = null;
  await runToolAgent({
    system: SYSTEM,
    prompt: `New supplier update for ${poId}: "${update.message}". Work out the best recovery and submit it.`,
    tools,
    maxIterations: 16,
    isDone: () => submitted !== null,
  });
  if (!submitted) throw new Error('Recovery agent finished without submitting a plan');
  return finalize(db, poId, update, baseline.firstShipDate, results, submitted, trace, 'live');
}

function finalize(
  db: DB,
  poId: string,
  update: SupplierUpdate & { message: string },
  baselineLaunch: string,
  results: Map<string, OptionResult>,
  s: z.infer<typeof SubmitSchema>,
  trace: Proposal['agentTrace'],
  source: 'live' | 'demo',
): RecoveryResult {
  const options = [...results.values()];
  const recommended = results.get(s.recommendedLabel)!;
  const body = enforceCompliance(s.customerNoticeBody);
  // Keep a deterministic optimum next to the agent's choice as a sanity check.
  const best = bestOption(db, { poId, delayTaskId: update.affectedTaskId, delayDays: update.delayDays }, update.offer ?? undefined);
  bus.emit('agent', { kind: 'check', text: `Optimizer check: best grid option impact $${best.totalImpact.toLocaleString()} vs agent's $${recommended.totalImpact.toLocaleString()}` });
  return {
    proposal: {
      poId,
      trigger: { message: update.message, taskId: update.affectedTaskId, delayDays: update.delayDays, reason: update.reason, supplierOffer: update.offer ?? undefined },
      baselineLaunch,
      options,
      recommendedKey: recommended.key,
      headline: s.headline,
      rationale: s.rationale,
      customerNotice: { subject: s.customerNoticeSubject, body },
      supplierMessage: s.supplierMessage,
      goodwillCredit: recommended.goodwillCredit,
      ftcChecks: ftcChecks(body),
      agentTrace: trace,
      source,
    },
  };
}
