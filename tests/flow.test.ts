import { beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { getDb, useDb } from '../server/db';
import { buildSeed } from '../server/seed/data';
import * as svc from '../server/services';
import { applySync, projectPayload } from '../server/bryntum';
import { keyDates } from '../server/sim';

// Full demo story in demo-AI + simulated-PayPal mode.
describe('end-to-end recovery flow', () => {
  beforeEach(() => useDb(buildSeed()));

  it('supplier delay → agent proposal → approval → notices, payouts, refunds', async () => {
    const { proposal } = await svc.handleSupplierUpdate('PO-1042', 'Kiln broke, production needs 12 more days. Pay $1,800 overtime and we can save 5 days.');
    expect(proposal).toBeTruthy();
    expect(proposal!.trigger.delayDays).toBe(12);
    expect(proposal!.ftcChecks.every(c => c.ok)).toBe(true);
    expect(proposal!.options.length).toBeGreaterThanOrEqual(4);

    const approved = await svc.approveProposal(proposal!.id);
    expect(approved.status).toBe('approved');
    const db = getDb();
    expect(keyDates(db)['PO-1042'].airLaunch).toBe('2026-11-17');
    const overtime = db.payments.find(p => p.label.startsWith('Overtime'));
    expect(overtime?.status).toBe('paid');
    const noticed = db.preorders.filter(p => p.noticeToken);
    expect(noticed.length).toBe(32);
    expect(db.outbox.filter(m => m.kind === 'customer_notice')).toHaveLength(32);
    expect(db.tasks.some(t => t.id === '1042-air')).toBe(true);
    expect(db.tasks.find(t => t.id === '1042-prod')!.baselineEnd).toBe('2026-11-03');

    const refunded = await svc.respondToNotice(noticed[0].noticeToken!, 'cancel');
    expect(refunded.status).toBe('refunded');
    expect(refunded.refundId).toMatch(/^SIM-REFUND/);
    const kept = await svc.respondToNotice(noticed[1].noticeToken!, 'keep');
    expect(kept.status).toBe('kept');
    expect(kept.promisedDate).toBe(kept.revisedDate);
  });

  it('QC gate: defects hold the balance, a clean batch releases it via PayPal', async () => {
    const s = (n: string) => path.resolve('public/samples', n);
    const bad = await svc.runQc('PO-1042', [s('qc-bad-1.png'), s('qc-bad-2.png')], []);
    expect(bad.verdict).toBe('fail');
    expect(getDb().payments.find(p => p.id === 'pay-1042-bal')!.status).toBe('held');
    const good = await svc.runQc('PO-1042', [s('qc-good-1.png'), s('qc-good-2.png')], []);
    expect(good.decision).toBe('released');
    expect(getDb().payments.find(p => p.id === 'pay-1042-bal')!.status).toBe('paid');
  });

  it('pre-order checkout captures with PayPal and records the promise date', async () => {
    const { orderId } = await svc.createCheckout('pour-over', 2);
    const pre = await svc.captureCheckout(orderId, 'pour-over', 2);
    expect(pre.amount).toBe(136);
    expect(pre.promisedDate).toBe('2026-11-26');
  });

  it('receiving a shipment ships pre-orders and pays on delivery', async () => {
    const r = await svc.receiveShipment('1044-launch');
    expect(r.restocked).toBe(400);
    expect(getDb().payments.find(p => p.id === 'pay-1044-pod')!.status).toBe('paid');
  });
});

describe('Bryntum CrudManager bridge', () => {
  beforeEach(() => useDb(buildSeed()));

  it('loads a task tree with PayPal payment fields', () => {
    const payload = projectPayload(getDb());
    const po = (payload.tasks.rows as any[]).find(r => r.id === 'g-1042');
    const balance = po.children.find((c: any) => c.id === '1042-balance');
    expect(balance.paymentStatus).toBe('scheduled');
    expect(balance.amount).toBe(15540);
  });

  it('applies a duration change from the Gantt and re-plans downstream', () => {
    applySync({ requestId: 1, tasks: { updated: [{ id: '1042-qc', duration: 9 }] } });
    expect(keyDates(getDb())['PO-1042'].launch).toBe('2026-12-02');
  });

  it('maps phantom ids for tasks added in the Gantt', () => {
    const res = applySync({ requestId: 2, tasks: { added: [{ $PhantomId: 'p1', name: 'Fumigation', parentId: 'g-1042', duration: 1, startDate: '2026-11-10' }] } }) as any;
    expect(res.tasks.rows[0].$PhantomId).toBe('p1');
  });
});
