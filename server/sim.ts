import { today } from './config.js';
import { addDays, diffDays, maxDate, toDay } from './dates.js';
import { computeSchedule } from './schedule.js';
import { BLACK_FRIDAY, CYBER_MONDAY, PROJECT_START } from './seed/data.js';
import type { DB, Dependency, OptionResult, Preorder, Product, Task } from './types.js';

// ---------------------------------------------------------------------------
// Demand model — deliberately simple and explainable so a merchant (and the
// agent) can reason about it: baseline daily velocity × holiday seasonality.
// When the product is out of stock, a share of demand converts to pre-orders
// and the rest walks away.
// ---------------------------------------------------------------------------

export const PREORDER_CONVERSION = 0.45;
export const AIR_COST_PER_UNIT = 7.8;
export const AIR_FIXED_COST = 450;
/** Peak-season air cargo space the forwarder can confirm before Black Friday. */
export const AIR_CAPACITY = 160;
export const HORIZON = '2026-12-31';
/** Per late order: ~$3 support contact + 6% chance of an item-not-received dispute (order value + $20 dispute fee). */
export const brokenPromiseCost = (amount: number) => 3 + 0.06 * (amount + 20);

export function seasonality(date: string): number {
  if (date >= BLACK_FRIDAY && date <= CYBER_MONDAY) return 4;
  if (date >= '2026-11-20' && date < BLACK_FRIDAY) return 1.4;
  if (date > CYBER_MONDAY && date <= '2026-12-18') return 1.8;
  return 1;
}

export function cancellationProbability(daysLate: number, goodwill: number): number {
  if (daysLate <= 0) return 0;
  const base = Math.min(0.45, 0.08 + 0.015 * daysLate);
  return goodwill > 0 ? base * 0.65 : base;
}

export interface Batch {
  date: string;
  units: number;
  label: string;
}

export interface DemandResult {
  lostUnits: number;
  lostRevenue: number;
  soldUnits: number;
  newPreorderUnits: number;
  stockoutDays: number;
  shipDates: Map<string, string>; // preorder id -> ship date
  stockSeries: { date: string; stock: number; demand: number }[];
}

/** Day-by-day simulation of stock, pre-order fulfilment and lost sales. */
export function simulateDemand(product: Product, preorders: Preorder[], batches: Batch[], from = today()): DemandResult {
  const queue = preorders
    .filter(p => p.productId === product.id && (p.status === 'active' || p.status === 'kept'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(p => ({ id: p.id, qty: p.qty }));
  const arrivals = new Map<string, number>();
  for (const b of batches) arrivals.set(b.date, (arrivals.get(b.date) ?? 0) + b.units);

  // Pre-orders already on the books before the window begins get fulfilled from
  // arrivals dated before `from` as well.
  let stock = product.stockOnHand;
  const shipDates = new Map<string, string>();
  let lostUnits = 0, soldUnits = 0, newPreorderUnits = 0, stockoutDays = 0;
  const series: DemandResult['stockSeries'] = [];
  let pendingNew = 0; // demand converted to new pre-orders, served after the existing queue

  const startDay = Math.min(toDay(from), ...batches.map(b => toDay(b.date)));
  for (let d = startDay; d <= toDay(HORIZON); d++) {
    const date = addDays('1970-01-01', d);
    stock += arrivals.get(date) ?? 0;
    while (queue.length && stock >= queue[0].qty) {
      const p = queue.shift()!;
      stock -= p.qty;
      shipDates.set(p.id, date);
    }
    if (!queue.length && pendingNew > 0) {
      const served = Math.min(stock, pendingNew);
      stock -= served;
      pendingNew -= served;
    }
    if (date < from) continue;
    const demand = product.dailyVelocity * seasonality(date);
    if (queue.length === 0 && pendingNew === 0 && stock >= demand) {
      stock -= demand;
      soldUnits += demand;
    } else {
      const sold = queue.length === 0 && pendingNew === 0 ? stock : 0;
      stock -= sold;
      soldUnits += sold;
      const unmet = demand - sold;
      stockoutDays += 1;
      if (product.preorderOpen) {
        newPreorderUnits += unmet * PREORDER_CONVERSION;
        pendingNew += unmet * PREORDER_CONVERSION;
        lostUnits += unmet * (1 - PREORDER_CONVERSION);
      } else {
        lostUnits += unmet;
      }
    }
    series.push({ date, stock: Math.max(0, Math.round(stock)), demand: Math.round(demand * 10) / 10 });
  }
  return {
    lostUnits: Math.round(lostUnits),
    lostRevenue: Math.round(lostUnits * product.price),
    soldUnits: Math.round(soldUnits),
    newPreorderUnits: Math.round(newPreorderUnits),
    stockoutDays,
    shipDates,
    stockSeries: series,
  };
}

// ---------------------------------------------------------------------------
// Plan scenarios
// ---------------------------------------------------------------------------

export interface ScenarioInput {
  poId: string;
  delayTaskId?: string;
  delayDays?: number;
  overtimeDays?: number;
  airUnits?: number;
  goodwillCredit?: number;
  overtimeCost?: number;
}

export interface Plan {
  tasks: Task[];
  deps: Dependency[];
}

export function scheduled(db: DB): Task[] {
  return computeSchedule(db.tasks, db.dependencies, PROJECT_START);
}

/** Build the air-freight branch that splits `units` off the main shipment. */
export function airBranch(poId: string, units: number): Plan {
  const p = poId.replace('PO-', '');
  const group = `g-${p}`;
  const tasks: Task[] = [
    { id: `${p}-air`, poId, parentId: group, name: `Air freight · ${units} units · PVG → LAX`, kind: 'air', duration: 3, percentDone: 0, resourceId: 'r-forwarder', addedBy: 'agent' },
    { id: `${p}-air-customs`, poId, parentId: group, name: 'Air cargo customs (express)', kind: 'customs', duration: 1, percentDone: 0, resourceId: 'r-customs', addedBy: 'agent' },
    { id: `${p}-air-wh`, poId, parentId: group, name: 'Receive air units at warehouse', kind: 'warehouse', duration: 1, percentDone: 0, resourceId: 'r-wh', addedBy: 'agent' },
    { id: `${p}-air-launch`, poId, parentId: group, name: `Ship pre-orders from air units (${units})`, kind: 'launch', duration: 0, percentDone: 0, resourceId: 'r-wh', addedBy: 'agent' },
  ];
  const deps: Dependency[] = [
    { id: `d-${p}-balance-air`, from: `${p}-balance`, to: `${p}-air`, lag: 0 },
    { id: `d-${p}-air-customs`, from: `${p}-air`, to: `${p}-air-customs`, lag: 0 },
    { id: `d-${p}-air-wh`, from: `${p}-air-customs`, to: `${p}-air-wh`, lag: 0 },
    { id: `d-${p}-air-launch`, from: `${p}-air-wh`, to: `${p}-air-launch`, lag: 0 },
  ];
  return { tasks, deps };
}

export function applyScenario(db: DB, input: ScenarioInput): Plan {
  const p = input.poId.replace('PO-', '');
  const tasks = db.tasks.map(t => ({ ...t }));
  let deps = db.dependencies.map(d => ({ ...d }));
  const delayTask = tasks.find(t => t.id === (input.delayTaskId ?? `${p}-prod`));
  if (delayTask) {
    delayTask.duration = Math.max(1, delayTask.duration + (input.delayDays ?? 0) - (input.overtimeDays ?? 0));
  }
  if (input.airUnits && input.airUnits > 0 && !tasks.some(t => t.id === `${p}-air`)) {
    const branch = airBranch(input.poId, Math.min(input.airUnits, AIR_CAPACITY));
    tasks.push(...branch.tasks);
    deps = deps.concat(branch.deps);
  }
  return { tasks, deps };
}

export function batchesFor(db: DB, productId: string, tasks: Task[]): Batch[] {
  const batches: Batch[] = [];
  for (const po of db.purchaseOrders.filter(o => o.productId === productId)) {
    const p = po.id.replace('PO-', '');
    const launch = tasks.find(t => t.id === `${p}-launch`);
    const air = tasks.find(t => t.id === `${p}-air-launch`);
    const airUnits = air ? Number(/(\d+)/.exec(air.name)?.[1] ?? po.splitAirUnits ?? 0) : 0;
    if (air?.computedEnd && airUnits > 0) batches.push({ date: air.computedEnd, units: airUnits, label: `${po.id} air` });
    if (launch?.computedEnd) batches.push({ date: launch.computedEnd, units: po.quantity - airUnits, label: po.id });
  }
  return batches;
}

export function evaluateScenario(db: DB, input: ScenarioInput, label = 'Option', description = ''): OptionResult & { plan: Plan; shipDates: Map<string, string> } {
  const plan = applyScenario(db, input);
  const tasks = computeSchedule(plan.tasks, plan.deps, PROJECT_START);
  const po = db.purchaseOrders.find(o => o.id === input.poId)!;
  const product = db.products.find(pr => pr.id === po.productId)!;
  const batches = batchesFor(db, product.id, tasks);
  const sim = simulateDemand(product, db.preorders, batches);
  const goodwill = input.goodwillCredit ?? 0;

  let late = 0, expCancel = 0, expRefunds = 0, goodwillCost = 0, promiseCost = 0;
  for (const pre of db.preorders) {
    if (pre.productId !== product.id || !(pre.status === 'active' || pre.status === 'kept')) continue;
    const ship = sim.shipDates.get(pre.id) ?? HORIZON;
    // Customers who already accepted a revised date are measured against that date.
    const daysLate = diffDays(ship, pre.revisedDate ?? pre.promisedDate);
    if (daysLate > 0) {
      late += 1;
      promiseCost += brokenPromiseCost(pre.amount);
      const pc = cancellationProbability(daysLate, goodwill);
      expCancel += pc;
      expRefunds += pc * pre.amount;
      goodwillCost += (1 - pc) * goodwill;
    }
  }
  const airUnits = Math.min(input.airUnits ?? 0, AIR_CAPACITY);
  const airCost = airUnits > 0 ? Math.round(AIR_FIXED_COST + airUnits * AIR_COST_PER_UNIT) : 0;
  const overtimeCost = input.overtimeDays ? input.overtimeCost ?? 0 : 0;
  const sorted = batches.sort((a, b) => a.date.localeCompare(b.date));
  const firstShip = sorted[0]?.date ?? HORIZON;
  const fullRestock = sorted.at(-1)?.date ?? HORIZON;
  const totalImpact = Math.round(sim.lostRevenue + expRefunds + airCost + overtimeCost + goodwillCost + promiseCost);
  return {
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    description,
    overtimeDays: input.overtimeDays ?? 0,
    overtimeCost,
    airUnits,
    airCost,
    goodwillCredit: goodwill,
    firstShipDate: firstShip,
    fullRestockDate: fullRestock,
    preordersLate: late,
    lostRevenue: sim.lostRevenue,
    expectedCancellations: Math.round(expCancel),
    expectedRefunds: Math.round(expRefunds),
    goodwillCost: Math.round(goodwillCost),
    brokenPromiseCost: Math.round(promiseCost),
    totalImpact,
    hitsBlackFriday: firstShip < BLACK_FRIDAY,
    plan: { tasks, deps: plan.deps },
    shipDates: sim.shipDates,
  };
}

/** Units needed to cover open pre-orders plus Black Friday → Cyber Monday demand. */
export function suggestedAirUnits(db: DB, productId: string): number {
  const product = db.products.find(p => p.id === productId)!;
  const preUnits = db.preorders.filter(p => p.productId === productId && (p.status === 'active' || p.status === 'kept')).reduce((s, p) => s + p.qty, 0);
  let peak = 0;
  for (let d = BLACK_FRIDAY; d <= CYBER_MONDAY; d = addDays(d, 1)) peak += product.dailyVelocity * seasonality(d);
  return Math.min(AIR_CAPACITY, Math.ceil((preUnits + peak) / 10) * 10);
}

/** Brute-force search used to sanity-check the agent and in demo mode. */
export function bestOption(db: DB, base: ScenarioInput, offer?: { overtimeDays: number; overtimeCost: number }) {
  const po = db.purchaseOrders.find(o => o.id === base.poId)!;
  const results: ReturnType<typeof evaluateScenario>[] = [];
  const overtimeChoices = offer ? [0, offer.overtimeDays] : [0];
  for (const ot of overtimeChoices) {
    for (let air = 0; air <= Math.min(AIR_CAPACITY, po.quantity); air += 20) {
      for (const goodwill of [0, 5]) {
        results.push(evaluateScenario(db, { ...base, overtimeDays: ot, overtimeCost: ot ? offer!.overtimeCost : 0, airUnits: air, goodwillCredit: goodwill }, `ot${ot}-air${air}-gw${goodwill}`));
      }
    }
  }
  return results.sort((a, b) => a.totalImpact - b.totalImpact)[0];
}

export function keyDates(db: DB) {
  const tasks = scheduled(db);
  return Object.fromEntries(
    db.purchaseOrders.map(po => {
      const p = po.id.replace('PO-', '');
      const launch = tasks.find(t => t.id === `${p}-launch`);
      const air = tasks.find(t => t.id === `${p}-air-launch`);
      return [po.id, { launch: launch?.computedEnd, airLaunch: air?.computedEnd }];
    }),
  );
}

export function nextPromiseDate(db: DB, productId: string, tasks: Task[]): string {
  const product = db.products.find(p => p.id === productId)!;
  const batches = batchesFor(db, productId, tasks).sort((a, b) => a.date.localeCompare(b.date));
  const committed = db.preorders.filter(p => p.productId === productId && (p.status === 'active' || p.status === 'kept')).reduce((s, p) => s + p.qty, 0);
  let capacity = product.stockOnHand - committed;
  for (const b of batches) {
    capacity += b.units;
    if (capacity > 25) return addDays(b.date, 1);
  }
  return maxDate(...batches.map(b => addDays(b.date, 1)));
}
