import { describe, expect, it } from 'vitest';
import { computeSchedule } from '../server/schedule';
import type { Dependency, Task } from '../server/types';

const task = (id: string, duration: number, extra: Partial<Task> = {}): Task => ({ id, poId: 'PO-1', name: id, kind: 'freight', duration, percentDone: 0, ...extra });

describe('computeSchedule', () => {
  it('schedules a finish-to-start chain ASAP from the project start', () => {
    const tasks = [task('a', 3), task('b', 2), task('c', 0)];
    const deps: Dependency[] = [
      { id: '1', from: 'a', to: 'b', lag: 0 },
      { id: '2', from: 'b', to: 'c', lag: 1 },
    ];
    const out = computeSchedule(tasks, deps, '2026-11-01');
    const by = Object.fromEntries(out.map(t => [t.id, t]));
    expect(by.a.computedStart).toBe('2026-11-01');
    expect(by.b.computedStart).toBe('2026-11-04');
    expect(by.c.computedStart).toBe('2026-11-07'); // 1 day lag
  });

  it('keeps manual tasks fixed and respects start-no-earlier-than', () => {
    const out = computeSchedule([task('a', 5, { manual: true, start: '2026-10-01' }), task('b', 1, { snet: '2026-10-20' })], [{ id: '1', from: 'a', to: 'b', lag: 0 }], '2026-09-01');
    expect(out[0].computedStart).toBe('2026-10-01');
    expect(out[1].computedStart).toBe('2026-10-20');
  });

  it('rolls summary tasks up from children', () => {
    const out = computeSchedule([task('g', 0, { kind: 'group' }), task('a', 2, { parentId: 'g' }), task('b', 4, { parentId: 'g' })], [{ id: '1', from: 'a', to: 'b', lag: 0 }], '2026-01-01');
    const g = out.find(t => t.id === 'g')!;
    expect(g.computedStart).toBe('2026-01-01');
    expect(g.computedEnd).toBe('2026-01-07');
  });

  it('rejects dependency cycles', () => {
    expect(() =>
      computeSchedule([task('a', 1), task('b', 1)], [
        { id: '1', from: 'a', to: 'b', lag: 0 },
        { id: '2', from: 'b', to: 'a', lag: 0 },
      ], '2026-01-01'),
    ).toThrow(/cycle/);
  });
});
