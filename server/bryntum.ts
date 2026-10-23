import { addDays, diffDays } from './dates.js';
import { getDb, log, newId, save } from './db.js';
import { bus } from './bus.js';
import { BLACK_FRIDAY, PROJECT_START } from './seed/data.js';
import { today } from './config.js';
import { batchesFor, evaluateScenario, scheduled, simulateDemand } from './sim.js';

const lastWarned = new Map<string, string>();
import type { DB, Dependency, Task } from './types.js';

// Converts Landed's store to Bryntum's CrudManager load/sync protocol so the
// Gantt reads and writes the same plan the agents work on.

type Row = Record<string, unknown> & { id: string; children?: Row[] };

const KIND_COLOR: Record<string, string> = {
  production: '#c2410c',
  qc: '#7c3aed',
  freight: '#0f766e',
  air: '#0284c7',
  customs: '#57534e',
  warehouse: '#4d7c0f',
  launch: '#111827',
  group: '#334155',
};
const PAY_COLOR: Record<string, string> = { paid: '#16a34a', scheduled: '#0070e0', processing: '#0070e0', held: '#d97706', failed: '#dc2626' };

export function projectPayload(db: DB, tasks: Task[] = scheduled(db), deps: Dependency[] = db.dependencies, extra: Partial<Record<string, unknown>> = {}) {
  const payments = new Map(db.payments.map(p => [p.id, p]));
  const rows = new Map<string, Row>();
  for (const t of tasks) {
    const pay = t.paymentId ? payments.get(t.paymentId) : undefined;
    const isGroup = t.kind === 'group';
    rows.set(t.id, {
      id: t.id,
      name: t.name,
      ...(isGroup
        ? { expanded: true }
        : {
            startDate: t.computedStart,
            duration: t.duration,
            durationUnit: 'day',
            manuallyScheduled: !!t.manual,
            ...(t.snet && !t.manual ? { constraintType: 'startnoearlierthan', constraintDate: t.snet } : {}),
          }),
      percentDone: t.percentDone,
      eventColor: t.kind === 'payment' ? PAY_COLOR[pay?.status ?? 'scheduled'] : KIND_COLOR[t.kind],
      cls: [t.addedBy === 'agent' && t.kind !== 'payment' && !t.id.startsWith('g-') ? 'agent-added' : '', `k-${t.kind}`].filter(Boolean).join(' '),
      kind: t.kind,
      poId: t.poId,
      note: t.note ?? '',
      addedBy: t.addedBy ?? '',
      paymentId: t.paymentId ?? '',
      paymentStatus: pay?.status ?? '',
      amount: pay?.amount ?? 0,
      payoutBatchId: pay?.payoutBatchId ?? '',
      ...(t.baselineStart && t.baselineEnd ? { baselines: [{ startDate: t.baselineStart, endDate: t.baselineEnd }] } : {}),
    });
  }
  const roots: Row[] = [];
  for (const t of tasks) {
    const row = rows.get(t.id)!;
    if (t.parentId && rows.has(t.parentId)) {
      const parent = rows.get(t.parentId)!;
      (parent.children ??= []).push(row);
    } else roots.push(row);
  }
  return {
    success: true,
    project: { calendar: 'allday', startDate: PROJECT_START, hoursPerDay: 24, daysPerWeek: 7, daysPerMonth: 30 },
    calendars: { rows: [{ id: 'allday', name: '24/7', unspecifiedTimeIsWorking: true }] },
    tasks: { rows: roots },
    dependencies: { rows: deps.map(d => ({ id: d.id, fromTask: d.from, toTask: d.to, lag: d.lag, lagUnit: 'day', type: 2 })) },
    resources: { rows: db.resources.map(r => ({ id: r.id, name: r.name, role: r.role, country: r.country })) },
    assignments: { rows: tasks.filter(t => t.resourceId && t.kind !== 'group').map(t => ({ id: `a-${t.id}`, event: t.id, resource: t.resourceId })) },
    timeRanges: {
      rows: [
        { id: 'today', name: 'Today', startDate: today(), duration: 0, cls: 'tr-today' },
        { id: 'bf', name: 'Black Friday', startDate: BLACK_FRIDAY, duration: 4, durationUnit: 'day', cls: 'tr-bf' },
        { id: 'promise', name: 'Promise to new buyers', startDate: db.products[0]?.promisedShipDate, duration: 0, cls: 'tr-promise' },
      ],
    },
    ...extra,
  };
}

const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : undefined);

interface SyncStore<T> {
  added?: (T & { $PhantomId: string })[];
  updated?: T[];
  removed?: { id: string }[];
}

/** Applies a Bryntum CrudManager sync request. Returns the response payload. */
export function applySync(body: {
  requestId?: number;
  tasks?: SyncStore<Record<string, unknown>>;
  dependencies?: SyncStore<Record<string, unknown>>;
}) {
  const db = getDb();
  if (process.env.LANDED_DEBUG_SYNC) console.log('[sync]', JSON.stringify(body).slice(0, 2000));
  const response: Record<string, unknown> = { success: true, requestId: body.requestId };
  const taskRows: Record<string, unknown>[] = [];
  const depRows: Record<string, unknown>[] = [];

  for (const a of body.tasks?.added ?? []) {
    const parent = db.tasks.find(t => t.id === a.parentId);
    const id = `m-${newId()}`;
    db.tasks.push({
      id,
      poId: parent?.poId ?? 'PO-1042',
      parentId: parent?.id,
      name: String(a.name ?? 'New task'),
      kind: 'freight',
      duration: Number(a.duration ?? 1),
      percentDone: 0,
      snet: day(a.startDate),
      addedBy: 'merchant',
    });
    taskRows.push({ $PhantomId: a.$PhantomId, id });
  }
  for (const u of body.tasks?.updated ?? []) {
    const t = db.tasks.find(x => x.id === u.id);
    if (!t || t.kind === 'group') continue;
    if (u.name !== undefined) t.name = String(u.name);
    if (u.duration !== undefined && u.duration !== null) t.duration = Math.max(0, Math.round(Number(u.duration)));
    if (u.percentDone !== undefined) t.percentDone = Math.round(Number(u.percentDone));
    if (u.manuallyScheduled !== undefined) t.manual = !!u.manuallyScheduled;
    if (t.manual && u.startDate) t.start = day(u.startDate);
    if (u.constraintType !== undefined) {
      t.snet = u.constraintType === 'startnoearlierthan' ? day(u.constraintDate) : undefined;
    }
    if (u.endDate && u.startDate && u.duration === undefined) t.duration = diffDays(day(u.endDate)!, day(u.startDate)!);
  }
  for (const r of body.tasks?.removed ?? []) {
    const t = db.tasks.find(x => x.id === r.id);
    if (!t || t.paymentId || t.kind === 'group') continue;
    db.tasks = db.tasks.filter(x => x.id !== r.id);
    db.dependencies = db.dependencies.filter(d => d.from !== r.id && d.to !== r.id);
  }
  for (const a of body.dependencies?.added ?? []) {
    const id = `d-${newId()}`;
    db.dependencies.push({ id, from: String(a.fromTask ?? a.from), to: String(a.toTask ?? a.to), lag: Number(a.lag ?? 0) });
    depRows.push({ $PhantomId: a.$PhantomId, id });
  }
  for (const u of body.dependencies?.updated ?? []) {
    const d = db.dependencies.find(x => x.id === u.id);
    if (d && u.lag !== undefined) d.lag = Math.round(Number(u.lag));
  }
  for (const r of body.dependencies?.removed ?? []) db.dependencies = db.dependencies.filter(d => d.id !== r.id);

  scheduled(db); // validate (throws on cycles)
  save();
  bus.emit('change', { scope: 'project', source: 'gantt' });
  // If a hand edit breaks customer promises, say so and offer the recovery agent.
  for (const po of db.purchaseOrders) {
    const late = evaluateScenario(db, { poId: po.id }, 'Current').preordersLate;
    const key = `${po.id}:${late}`;
    if (late > 0 && lastWarned.get(po.id) !== key && !db.proposals.some(p => p.poId === po.id && p.status === 'pending')) {
      lastWarned.set(po.id, key);
      log({ actor: 'agent', type: 'promise_risk', title: `That change pushes ${late} pre-orders past their promised date`, detail: 'Open the command center to let the recovery agent find a fix.', link: '/' });
    }
    if (late === 0) lastWarned.delete(po.id);
  }
  if (taskRows.length) response.tasks = { rows: taskRows };
  if (depRows.length) response.dependencies = { rows: depRows };
  return response;
}

/** Stock-runway lanes for the Scheduler view: one row per product. */
export function runwayPayload(db: DB) {
  const tasks = scheduled(db);
  const resources = db.products.map(p => ({ id: p.id, name: p.name, sku: p.sku, stock: p.stockOnHand, image: p.image }));
  const events: Record<string, unknown>[] = [];
  for (const product of db.products) {
    const batches = batchesFor(db, product.id, tasks);
    const sim = simulateDemand(product, db.preorders, batches);
    let seg: { state: string; start: string; units: number } | null = null;
    const flush = (end: string) => {
      if (!seg) return;
      const label = seg.state === 'in' ? `In stock` : product.preorderOpen ? 'Sold out · taking pre-orders' : 'Sold out · losing sales';
      const state = seg.state === 'in' ? 'in' : product.preorderOpen ? 'preorder' : 'lost';
      events.push({ id: `${product.id}-${seg.start}`, resourceId: product.id, name: label, startDate: seg.start, endDate: end, state, eventColor: { in: '#16a34a', preorder: '#d97706', lost: '#dc2626' }[state] });
    };
    for (const pt of sim.stockSeries) {
      const state = pt.stock >= Math.max(1, pt.demand * 0.5) ? 'in' : 'out';
      if (!seg || seg.state !== state) {
        flush(pt.date);
        seg = { state, start: pt.date, units: pt.stock };
      }
    }
    if (sim.stockSeries.length) flush(addDays(sim.stockSeries.at(-1)!.date, 1));
    for (const b of batches) {
      events.push({ id: `arr-${product.id}-${b.label}`, resourceId: product.id, name: `+${b.units} ${b.label.endsWith('air') ? 'by air' : 'units'}`, startDate: b.date, endDate: b.date, duration: 0, state: 'arrival', eventColor: '#1d4ed8' });
    }
  }
  return { resources, events, startDate: addDays(sortedFirst(events), -2) };
}

function sortedFirst(events: Record<string, unknown>[]) {
  return events.map(e => String(e.startDate)).sort()[0] ?? PROJECT_START;
}
