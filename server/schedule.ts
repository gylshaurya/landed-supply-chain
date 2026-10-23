import { addDays, diffDays, maxDate, minDate } from './dates.js';
import type { Dependency, Task } from './types.js';

/**
 * Forward-pass (ASAP) scheduler mirroring how Bryntum's engine schedules our
 * project: 24/7 calendar, finish-to-start dependencies with lag, manually
 * scheduled tasks keep their start, others start as soon as their
 * predecessors and start-no-earlier-than constraint allow. Bryntum stays the
 * source of truth in the browser; this lets the agent run what-if
 * simulations on the server without a DOM.
 */
export function computeSchedule(tasks: Task[], deps: Dependency[], projectStart: string): Task[] {
  const out = tasks.map(t => ({ ...t }));
  const byId = new Map(out.map(t => [t.id, t]));
  const parents = new Set(out.filter(t => t.parentId).map(t => t.parentId!));
  const leaves = out.filter(t => !parents.has(t.id));

  const preds = new Map<string, Dependency[]>();
  for (const d of deps) {
    if (!byId.has(d.from) || !byId.has(d.to)) continue;
    if (!preds.has(d.to)) preds.set(d.to, []);
    preds.get(d.to)!.push(d);
  }

  const order = topoSort(leaves.map(t => t.id), deps.filter(d => byId.has(d.from) && byId.has(d.to)));
  for (const id of order) {
    const t = byId.get(id)!;
    let start: string;
    if (t.manual && t.start) {
      start = t.start;
    } else {
      const candidates = [t.snet ?? projectStart];
      for (const d of preds.get(id) ?? []) {
        const p = byId.get(d.from)!;
        if (p.computedEnd) candidates.push(addDays(p.computedEnd, d.lag));
      }
      start = maxDate(...candidates);
    }
    t.computedStart = start;
    t.computedEnd = addDays(start, t.duration);
  }

  // Roll summary tasks up from their children (deepest first)
  const depth = (t: Task): number => (t.parentId ? 1 + depth(byId.get(t.parentId)!) : 0);
  const summaries = out.filter(t => parents.has(t.id)).sort((a, b) => depth(b) - depth(a));
  for (const s of summaries) {
    const kids = out.filter(t => t.parentId === s.id && t.computedStart);
    if (!kids.length) continue;
    s.computedStart = minDate(...kids.map(k => k.computedStart));
    s.computedEnd = maxDate(...kids.map(k => k.computedEnd));
    s.duration = diffDays(s.computedEnd!, s.computedStart!);
  }
  return out;
}

export function topoSort(ids: string[], deps: Dependency[]): string[] {
  const set = new Set(ids);
  const indeg = new Map(ids.map(id => [id, 0]));
  const next = new Map<string, string[]>();
  for (const d of deps) {
    if (!set.has(d.from) || !set.has(d.to)) continue;
    indeg.set(d.to, (indeg.get(d.to) ?? 0) + 1);
    if (!next.has(d.from)) next.set(d.from, []);
    next.get(d.from)!.push(d.to);
  }
  const queue = ids.filter(id => indeg.get(id) === 0);
  const result: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);
    for (const n of next.get(id) ?? []) {
      indeg.set(n, indeg.get(n)! - 1);
      if (indeg.get(n) === 0) queue.push(n);
    }
  }
  if (result.length !== ids.length) throw new Error('Dependency cycle detected in plan');
  return result;
}

/** Tasks on the longest path into `targetId` (zero total float). */
export function criticalChain(tasks: Task[], deps: Dependency[], targetId: string): string[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const chain: string[] = [];
  let current = byId.get(targetId);
  while (current) {
    chain.unshift(current.id);
    const incoming = deps
      .filter(d => d.to === current!.id && byId.get(d.from)?.computedEnd)
      .map(d => ({ d, end: addDays(byId.get(d.from)!.computedEnd!, d.lag) }))
      .filter(x => x.end === current!.computedStart);
    current = incoming.length ? byId.get(incoming[0].d.from) : undefined;
  }
  return chain;
}
