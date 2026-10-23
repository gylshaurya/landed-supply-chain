// Demo-mode stand-ins used only when no ANTHROPIC_API_KEY is configured, so
// judges can click through the full flow offline. Every screen that shows
// demo output is labelled "Demo AI". With a key, the real agents run.

import { fmt } from '../dates.js';
import { BLACK_FRIDAY } from '../seed/data.js';
import { AIR_CAPACITY, suggestedAirUnits } from '../sim.js';
import type { DB, OptionResult, QcReport } from '../types.js';
import type { SupplierUpdate } from './recovery.js';

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14 };

function num(token: string): number {
  return WORDS[token.toLowerCase()] ?? Number(token);
}

export function demoSupplierUpdate(poId: string, message: string): SupplierUpdate {
  const p = poId.replace('PO-', '');
  const m = message.toLowerCase();
  const weeks = /(\w+)\s+weeks?/.exec(m);
  const days = /(\w+)\s+(?:more\s+|extra\s+|additional\s+)?days?/.exec(m);
  let delay = days ? num(days[1]) : weeks ? num(weeks[1]) * 7 : 0;
  if (!Number.isFinite(delay)) delay = 0;
  const cost = /\$\s?([\d,]+)/.exec(message);
  const recover = /(?:save|recover|cut|win back|gain)\s+(\w+)\s+days?/.exec(m);
  const offer = cost && recover ? { overtimeDays: num(recover[1]), overtimeCost: Number(cost[1].replace(/,/g, '')) } : null;
  return {
    kind: delay > 0 ? 'delay' : 'on_track',
    affectedTaskId: `${p}-prod`,
    delayDays: delay,
    reason: delay > 0 ? 'Factory reports a production slip.' : 'Supplier reports progress on schedule.',
    offer,
    confidence: 0.7,
  };
}

type Sim = (label: string, overtime: number, air: number, goodwill: number) => OptionResult;
type Emit = (t: { tool: string; input: unknown; summary: string }) => void;

export function demoRecovery(db: DB, poId: string, update: SupplierUpdate, simulate: Sim, emit: Emit) {
  const po = db.purchaseOrders.find(o => o.id === poId)!;
  const product = db.products.find(p => p.id === po.productId)!;
  emit({ tool: 'get_situation', input: {}, summary: `Pre-orders promised ${fmt(product.promisedShipDate)}; ${update.delayDays ? `supplier slip ${update.delayDays} days` : 'timeline edited by hand'}` });
  const tried: OptionResult[] = [];
  const run = (label: string, ot: number, air: number, gw: number) => {
    const r = simulate(label, ot, air, gw);
    tried.push(r);
    emit({ tool: 'simulate_option', input: { label, useSupplierOvertime: !!ot, airUnits: air, goodwillCredit: gw }, summary: `${label}: first ship ${fmt(r.firstShipDate)}, ${r.preordersLate} late, impact $${r.totalImpact.toLocaleString()}` });
    return r;
  };
  const wait = run('Wait it out', 0, 0, 0);
  const suggested = suggestedAirUnits(db, product.id);
  if (update.offer) run('Pay for factory overtime', 1, 0, 0);
  const half = Math.round(AIR_CAPACITY / 2 / 10) * 10;
  run(`Air-freight ${half} units`, 0, half, 0);
  run(`Air-freight ${suggested} units`, 0, suggested, 0);
  if (update.offer) {
    run(`Overtime + air-freight ${suggested} units`, 1, suggested, 0);
    const late = tried.at(-1)!.preordersLate > 0;
    if (late) run(`Overtime + air-freight ${suggested} units + $5 credit`, 1, suggested, 5);
  }
  const best = [...tried].sort((a, b) => a.totalImpact - b.totalImpact)[0];
  const saved = wait.totalImpact - best.totalImpact;
  const total = db.preorders.filter(p => p.productId === product.id && (p.status === 'active' || p.status === 'kept')).length;
  const s = {
    recommendedLabel: best.label,
    headline: `${best.label}: ${total - best.preordersLate} of ${total} pre-orders still ship on time (from ${fmt(best.firstShipDate)}, before Black Friday), ${best.preordersLate} get an honest notice, and it saves about $${saved.toLocaleString()} versus waiting.`,
    rationale: `Waiting pushes every pre-order to ${fmt(wait.firstShipDate)}, after Black Friday (${fmt(BLACK_FRIDAY)}), breaking ${wait.preordersLate} promises and losing an estimated $${wait.lostRevenue.toLocaleString()} in sales. ${best.label} costs $${(best.airCost + best.overtimeCost).toLocaleString()} up front but ships the first units ${fmt(best.firstShipDate)}, so ${best.preordersLate === 0 ? 'no pre-order customer gets a broken promise' : `${best.preordersLate} customers are late`} and Black Friday demand is covered. The remaining units follow by sea on ${fmt(best.fullRestockDate)}.`,
    customerNoticeSubject: 'An update on your Kiln & Co pre-order',
    customerNoticeBody:
      'Hi {{name}},\n\nOur kiln partner in Jingdezhen hit a production delay, so your pour-over set (order {{order_id}}) will ship on {{revised_date}} instead of {{original_date}}. We are sorry — we would rather tell you now than surprise you later.\n\nYou have two options:\n• Keep your order — no action needed, or confirm here: {{keep_link}}\n• Cancel at no cost with one click for a full refund to your PayPal account: {{cancel_link}}\n\nThank you for your patience,\nThe Kiln & Co team',
    supplierMessage: best.overtimeDays
      ? `Approved: please run the overtime shifts (+$${best.overtimeCost.toLocaleString()}) and pack the first ${best.airUnits} sets for air freight as soon as QC passes.`
      : `Understood. Please pack the first ${best.airUnits} sets for air freight as soon as QC passes.`,
    goodwillCredit: best.goodwillCredit,
  };
  emit({ tool: 'submit_plan', input: { recommendedLabel: s.recommendedLabel }, summary: s.headline });
  return s;
}

export function demoQc(photos: string[]): Omit<QcReport, 'id' | 'poId' | 'createdAt' | 'photos' | 'decision' | 'source'> {
  const bad = photos.some(p => /bad|defect/i.test(p));
  const good = photos.length > 0 && photos.every(p => /good/i.test(p));
  if (bad) {
    return {
      verdict: 'fail',
      confidence: 0.86,
      summary: 'Glaze colour is off-spec (blue-teal instead of sage) and one dripper shows a hairline crack; the carton label reads KC-POS-10 instead of KC-POS-01.',
      checks: [
        { name: 'Glaze colour matches the approved sage sample', result: 'fail', note: 'Visibly bluer than the reference.' },
        { name: 'No cracks, chips or glaze defects', result: 'fail', note: 'Hairline crack running up from the base.' },
        { name: 'Carton label shows SKU KC-POS-01', result: 'fail', note: 'Label reads KC-POS-10.' },
        { name: 'Kiln & Co mark present and legible', result: 'pass', note: 'Mark visible.' },
      ],
      defects: [
        { type: 'Colour deviation', severity: 'major', description: 'Glaze is blue-teal, not speckled sage.', photoIndex: 0 },
        { type: 'Crack', severity: 'critical', description: 'Hairline crack on the dripper body.', photoIndex: 0 },
        { type: 'Labelling', severity: 'major', description: 'Wrong SKU printed on carton.', photoIndex: 1 },
      ],
      estimatedDefectRatePct: 12,
      supplierMessage: 'Batch failed inspection: off-spec glaze colour, cracked dripper, and cartons printed KC-POS-10. Please re-fire and relabel before we release the balance.',
    };
  }
  if (good) {
    return {
      verdict: 'pass',
      confidence: 0.91,
      summary: 'Speckled sage glaze matches the sample, no visible cracks or chips, Kiln & Co mark is crisp and the carton label reads SKU KC-POS-01.',
      checks: [
        { name: 'Glaze colour matches the approved sage sample', result: 'pass', note: 'Sage with dark speckle.' },
        { name: 'No cracks, chips or glaze defects', result: 'pass', note: 'Clean surfaces.' },
        { name: 'Carton label shows SKU KC-POS-01', result: 'pass', note: 'Correct SKU.' },
        { name: 'Kiln & Co mark present and legible', result: 'pass', note: 'Legible.' },
      ],
      defects: [],
      estimatedDefectRatePct: 0.8,
      supplierMessage: 'Batch passed inspection — releasing the balance payment now. Thank you!',
    };
  }
  return {
    verdict: 'needs_review',
    confidence: 0.4,
    summary: 'Demo mode can only grade the bundled sample photos. Add a GEMINI_API_KEY (free) for live vision inspection.',
    checks: [],
    defects: [],
    estimatedDefectRatePct: 0,
    supplierMessage: 'Thanks — a team member will review these photos.',
  };
}
