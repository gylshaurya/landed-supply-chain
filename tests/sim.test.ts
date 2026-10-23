import { describe, expect, it } from 'vitest';
import { buildSeed } from '../server/seed/data';
import { AIR_CAPACITY, bestOption, evaluateScenario, scheduled } from '../server/sim';
import { enforceCompliance, ftcChecks } from '../server/ai/notice';

describe('seed plan', () => {
  it('lands PO-1042 before the promised pre-order date', () => {
    const tasks = scheduled(buildSeed());
    expect(tasks.find(t => t.id === '1042-launch')!.computedEnd).toBe('2026-11-25');
  });
});

describe('scenario simulation', () => {
  const db = buildSeed();
  const wait = evaluateScenario(db, { poId: 'PO-1042', delayDays: 12 }, 'Wait');

  it('a 12-day slip breaks every pre-order promise and misses Black Friday', () => {
    expect(wait.firstShipDate).toBe('2026-12-07');
    expect(wait.preordersLate).toBe(172);
    expect(wait.hitsBlackFriday).toBe(false);
  });

  it('air-freighting a split ships before Black Friday and is capped by cargo space', () => {
    const air = evaluateScenario(db, { poId: 'PO-1042', delayDays: 12, airUnits: 999 }, 'Air');
    expect(air.airUnits).toBe(AIR_CAPACITY);
    expect(air.hitsBlackFriday).toBe(true);
    expect(air.preordersLate).toBeLessThan(wait.preordersLate);
  });

  it('the optimizer finds something strictly better than waiting', () => {
    const best = bestOption(db, { poId: 'PO-1042', delayDays: 12 }, { overtimeDays: 5, overtimeCost: 1800 });
    expect(best.totalImpact).toBeLessThan(wait.totalImpact);
  });
});

describe('FTC Mail Order Rule checks', () => {
  it('flags a notice with no cancel option and repairs it', () => {
    const bad = 'Hi {{name}}, your order now ships {{revised_date}}.';
    expect(ftcChecks(bad).every(c => c.ok)).toBe(false);
    expect(ftcChecks(enforceCompliance(bad)).every(c => c.ok)).toBe(true);
  });
});
