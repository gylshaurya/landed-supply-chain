import path from 'node:path';
import { aiMode, config, paypalMode, today } from './config.js';
import { addDays, fmt, fmtLong } from './dates.js';
import { bus } from './bus.js';
import { getDb, log, newId, save } from './db.js';
import * as paypal from './paypal.js';
import { inspect } from './ai/qc.js';
import { renderNotice } from './ai/notice.js';
import { parseSupplierUpdate, runRecoveryAgent } from './ai/recovery.js';
import type { Intake } from './ai/intake.js';
import { airBranch, evaluateScenario, nextPromiseDate, scheduled } from './sim.js';
import type { Preorder, Proposal, QcReport, SupplierPayment, Task } from './types.js';

const changed = (scope: string) => bus.emit('change', { scope });

export function appUrl(p: string) {
  return `${config.publicUrl || ''}${p}`;
}

// ---------------------------------------------------------------------------
// Supplier payments (PayPal Payouts)
// ---------------------------------------------------------------------------

export async function releasePayment(paymentId: string, reason: string): Promise<SupplierPayment> {
  const db = getDb();
  const pay = db.payments.find(p => p.id === paymentId);
  if (!pay) throw new Error('Unknown payment');
  if (pay.status === 'paid' || pay.status === 'processing') return pay;
  const po = db.purchaseOrders.find(o => o.id === pay.poId)!;
  const supplier = db.suppliers.find(s => s.id === po.supplierId)!;
  pay.status = 'processing';
  changed('payments');
  try {
    const r = await paypal.payout({
      receiver: supplier.paypalEmail,
      amount: pay.amount,
      subject: `Kiln & Co payment · ${po.id} ${pay.label}`,
      note: `${po.id} · ${pay.label} · ${reason}`,
      senderItemId: `${pay.id}`,
    });
    pay.status = 'paid';
    pay.payoutBatchId = r.batchId;
    pay.payoutItemId = r.itemId;
    pay.paidAt = today();
    pay.simulated = r.simulated;
    pay.holdReason = undefined;
    const task = db.tasks.find(t => t.paymentId === pay.id);
    if (task) task.percentDone = 100;
    log({ actor: 'paypal', type: 'payout', title: `Paid ${supplier.name} $${pay.amount.toLocaleString()} · ${pay.label}`, detail: `${reason} PayPal payout batch ${r.batchId}${r.simulated ? ' (simulated)' : ''}.`, link: '/payments' });
  } catch (e) {
    pay.status = 'failed';
    pay.holdReason = (e as Error).message;
    log({ actor: 'paypal', type: 'payout_failed', title: `Payout to ${supplier.name} failed`, detail: (e as Error).message, link: '/payments' });
  }
  save();
  changed('payments');
  return pay;
}

// ---------------------------------------------------------------------------
// QC inspection → payment gate
// ---------------------------------------------------------------------------

export async function runQc(poId: string, photoPaths: string[], publicPaths: string[]): Promise<QcReport> {
  const db = getDb();
  const po = db.purchaseOrders.find(o => o.id === poId);
  if (!po) throw new Error('Unknown PO');
  log({ actor: 'supplier', type: 'qc_photos', title: `${po.id}: ${photoPaths.length} QC photos uploaded`, detail: 'Inspection agent is checking them against the spec and golden sample.' });
  bus.emit('agent', { kind: 'qc_start', poId });
  const reference = path.resolve('public/samples/golden-sample.png');
  const result = await inspect(po, photoPaths, po.id === 'PO-1042' ? reference : undefined);
  const balance = db.payments.find(p => p.poId === poId && p.gate === 'qc_pass' && p.status !== 'paid');
  const passes = result.verdict === 'pass' && result.confidence >= 0.75 && !result.defects.some(d => d.severity === 'critical');
  const report: QcReport = {
    id: newId(),
    poId,
    createdAt: new Date().toISOString(),
    photos: publicPaths,
    ...result,
    decision: passes ? 'released' : result.verdict === 'fail' ? 'held' : 'review',
  };
  db.qcReports.unshift(report);
  const qcTask = db.tasks.find(t => t.poId === poId && t.kind === 'qc');
  if (passes) {
    if (qcTask) qcTask.percentDone = 100;
    po.status = 'qc';
    log({ actor: 'agent', type: 'qc_pass', title: `${po.id} passed QC (${Math.round(result.confidence * 100)}% confidence)`, detail: result.summary, link: '/payments' });
    save();
    if (balance) await releasePayment(balance.id, 'Released automatically: AI QC inspection passed.');
  } else {
    if (balance) {
      balance.status = 'held';
      balance.holdReason = `QC ${result.verdict}: ${result.summary}`;
    }
    log({ actor: 'agent', type: 'qc_fail', title: `${po.id} ${result.verdict === 'fail' ? 'failed QC — balance held' : 'needs human review'}`, detail: result.summary, link: '/payments' });
    db.outbox.unshift({ id: newId(), ts: new Date().toISOString(), to: db.suppliers.find(s => s.id === po.supplierId)!.contact, subject: `QC result for ${po.id}`, body: result.supplierMessage, kind: 'supplier' });
  }
  save();
  changed('qc');
  bus.emit('agent', { kind: 'qc_done', poId, reportId: report.id });
  return report;
}

// ---------------------------------------------------------------------------
// Supplier update → recovery agent → proposal
// ---------------------------------------------------------------------------

export async function handleSupplierUpdate(poId: string, message: string) {
  const db = getDb();
  const po = db.purchaseOrders.find(o => o.id === poId);
  if (!po) throw new Error('Unknown PO');
  const supplier = db.suppliers.find(s => s.id === po.supplierId)!;
  const upd = { id: newId(), poId, ts: new Date().toISOString(), message } as (typeof db.supplierUpdates)[number];
  db.supplierUpdates.unshift(upd);
  log({ actor: 'supplier', type: 'update', title: `${supplier.name}: “${message.length > 90 ? message.slice(0, 90) + '…' : message}”`, link: '/timeline' });
  bus.emit('agent', { kind: 'start', text: 'Reading the supplier update…' });
  const parsed = await parseSupplierUpdate(db, poId, message);
  bus.emit('agent', { kind: 'parsed', text: `${parsed.kind === 'delay' ? `Delay detected: ${parsed.delayDays} days on ${parsed.affectedTaskId}` : 'No delay detected'}${parsed.offer ? ` · supplier offers ${parsed.offer.overtimeDays} days back for $${parsed.offer.overtimeCost.toLocaleString()}` : ''}`, parsed });
  if (parsed.kind !== 'delay' || parsed.delayDays <= 0) {
    log({ actor: 'agent', type: 'parsed', title: 'Supplier update logged — no schedule impact', detail: parsed.reason });
    bus.emit('agent', { kind: 'done', text: 'No action needed.' });
    save();
    return { proposal: null, parsed };
  }
  const { proposal } = await runRecoveryAgent(db, poId, { ...parsed, message }, t => bus.emit('agent', { kind: 'trace', ...t }));
  const full: Proposal = { id: newId(), createdAt: new Date().toISOString(), status: 'pending', ...proposal };
  db.proposals.unshift(full);
  upd.proposalId = full.id;
  log({ actor: 'agent', type: 'proposal', title: `Recovery plan ready for ${poId}`, detail: full.headline, link: `/proposals/${full.id}` });
  save();
  changed('proposals');
  bus.emit('agent', { kind: 'done', text: full.headline, proposalId: full.id });
  return { proposal: full, parsed };
}

/** The merchant changed the plan by hand (e.g. dragged a bar in the Gantt) and promises broke. */
export async function recoverFromPlanChange(poId: string) {
  const db = getDb();
  const p = poId.replace('PO-', '');
  const update = { kind: 'delay' as const, affectedTaskId: `${p}-prod`, delayDays: 0, reason: 'The timeline was changed by hand and the launch moved past the promised date.', offer: null, confidence: 1, message: `Timeline for ${poId} was changed on the Gantt; pre-order promises are now at risk.` };
  bus.emit('agent', { kind: 'start', text: 'Re-checking customer promises against the edited timeline…' });
  const { proposal } = await runRecoveryAgent(db, poId, update, t => bus.emit('agent', { kind: 'trace', ...t }));
  const full: Proposal = { id: newId(), createdAt: new Date().toISOString(), status: 'pending', ...proposal };
  db.proposals.unshift(full);
  log({ actor: 'agent', type: 'proposal', title: `Recovery plan ready for ${poId}`, detail: full.headline, link: `/proposals/${full.id}` });
  save();
  changed('proposals');
  bus.emit('agent', { kind: 'done', text: full.headline, proposalId: full.id });
  return full;
}

/** Pre-orders that would ship after their promised date under the current plan. */
export function promisesAtRisk(poId: string) {
  const db = getDb();
  return evaluateScenario(db, { poId }, 'Current').preordersLate;
}

/** Bryntum-ready project including the proposal's changes, with today's plan as the baseline. */
export function proposalPlan(p: Proposal) {
  const db = getDb();
  const opt = p.options.find(o => o.key === p.recommendedKey)!;
  const before = scheduled(db);
  const res = evaluateScenario(db, { poId: p.poId, delayTaskId: p.trigger.taskId, delayDays: p.trigger.delayDays, overtimeDays: opt.overtimeDays, overtimeCost: opt.overtimeCost, airUnits: opt.airUnits, goodwillCredit: opt.goodwillCredit }, opt.label);
  const tasks = res.plan.tasks.map(t => {
    const b = before.find(x => x.id === t.id);
    return { ...t, baselineStart: b?.computedStart, baselineEnd: b?.computedEnd };
  });
  return { tasks, deps: res.plan.deps, shipDates: res.shipDates, option: opt };
}

export async function approveProposal(id: string) {
  const db = getDb();
  const p = db.proposals.find(x => x.id === id);
  if (!p) throw new Error('Unknown proposal');
  if (p.status !== 'pending') return p;
  const po = db.purchaseOrders.find(o => o.id === p.poId)!;
  const product = db.products.find(pr => pr.id === po.productId)!;
  const supplier = db.suppliers.find(s => s.id === po.supplierId)!;
  const { option: opt, shipDates } = proposalPlan(p);
  const logLines: string[] = [];

  // 1. Snapshot the current plan as the baseline, then apply the change.
  const before = scheduled(db);
  for (const t of db.tasks) {
    const b = before.find(x => x.id === t.id);
    t.baselineStart = b?.computedStart;
    t.baselineEnd = b?.computedEnd;
  }
  const delayTask = db.tasks.find(t => t.id === p.trigger.taskId)!;
  delayTask.duration = Math.max(1, delayTask.duration + p.trigger.delayDays - opt.overtimeDays);
  const net = p.trigger.delayDays - opt.overtimeDays;
  if (p.trigger.delayDays || opt.overtimeDays) {
    delayTask.note = [p.trigger.delayDays ? `+${p.trigger.delayDays}d supplier slip` : '', opt.overtimeDays ? `−${opt.overtimeDays}d paid overtime` : ''].filter(Boolean).join(', ');
    logLines.push(`${net >= 0 ? 'Extended' : 'Shortened'} “${delayTask.name}” by ${Math.abs(net)} days (Bryntum re-schedules every dependent task).`);
  }
  if (opt.airUnits > 0 && !db.tasks.some(t => t.id === `${p.poId.replace('PO-', '')}-air`)) {
    const branch = airBranch(p.poId, opt.airUnits);
    db.tasks.push(...branch.tasks);
    db.dependencies.push(...branch.deps);
    po.splitAirUnits = opt.airUnits;
    logLines.push(`Added an air-freight branch for ${opt.airUnits} units.`);
  }
  save();
  changed('project');

  // 2. Pay for overtime through PayPal if that was part of the plan.
  if (opt.overtimeDays > 0 && opt.overtimeCost > 0) {
    const pay: SupplierPayment = { id: `pay-${po.id}-ot-${newId().slice(0, 4)}`, poId: po.id, label: `Overtime premium (−${opt.overtimeDays} days)`, type: 'deposit', amount: opt.overtimeCost, currency: 'USD', status: 'scheduled', gate: 'none' };
    db.payments.push(pay);
    const r = await releasePayment(pay.id, 'Approved recovery plan: paid overtime to recover schedule.');
    logLines.push(`Paid ${supplier.name} $${opt.overtimeCost.toLocaleString()} overtime premium via PayPal Payouts (${r.status}).`);
  }

  // 3. Notify customers whose promise broke (FTC Mail Order Rule) and update the store promise.
  const afterTasks = scheduled(db);
  let notified = 0;
  for (const pre of db.preorders) {
    if (pre.productId !== product.id || !(pre.status === 'active' || pre.status === 'kept')) continue;
    const ship = shipDates.get(pre.id);
    if (!ship) continue;
    const revised = addDays(ship, 1);
    if (revised <= pre.promisedDate) continue;
    pre.originalPromisedDate = pre.originalPromisedDate ?? pre.promisedDate;
    pre.revisedDate = revised;
    pre.noticeToken = pre.noticeToken ?? newId();
    pre.noticeSentAt = new Date().toISOString();
    pre.status = 'active';
    const vars = {
      name: pre.customerName.split(' ')[0],
      order_id: pre.id.toUpperCase(),
      original_date: fmtLong(pre.promisedDate),
      revised_date: fmtLong(revised),
      keep_link: appUrl(`/notice/${pre.noticeToken}?choice=keep`),
      cancel_link: appUrl(`/notice/${pre.noticeToken}?choice=cancel`),
    };
    db.outbox.unshift({ id: newId(), ts: new Date().toISOString(), to: pre.email, subject: p.customerNotice.subject, body: renderNotice(p.customerNotice.body, vars), link: `/notice/${pre.noticeToken}`, kind: 'customer_notice' });
    notified++;
  }
  logLines.push(notified ? `Sent ${notified} FTC-compliant delay notices with one-click keep / cancel-for-full-refund links.` : 'Every pre-order still ships on time — no customer notices needed.');
  const newPromise = nextPromiseDate(db, product.id, afterTasks);
  if (newPromise !== product.promisedShipDate) {
    logLines.push(`Storefront promise for new pre-orders moved ${fmt(product.promisedShipDate)} → ${fmt(newPromise)}.`);
    product.promisedShipDate = newPromise;
  }

  // 4. Reply to the supplier.
  db.outbox.unshift({ id: newId(), ts: new Date().toISOString(), to: supplier.contact, subject: `Re: ${po.id} schedule`, body: p.supplierMessage, kind: 'supplier' });
  logLines.push(`Replied to ${supplier.name}.`);

  p.status = 'approved';
  p.approvedAt = new Date().toISOString();
  p.executionLog = logLines;
  log({ actor: 'merchant', type: 'approved', title: `Recovery plan approved · ${opt.label}`, detail: logLines.join(' '), link: `/proposals/${p.id}` });
  save();
  changed('all');
  return p;
}

export function rejectProposal(id: string) {
  const db = getDb();
  const p = db.proposals.find(x => x.id === id);
  if (!p) throw new Error('Unknown proposal');
  p.status = 'rejected';
  log({ actor: 'merchant', type: 'rejected', title: 'Recovery plan dismissed', detail: p.headline });
  save();
  changed('proposals');
  return p;
}

// ---------------------------------------------------------------------------
// Customers: checkout + delay-notice responses
// ---------------------------------------------------------------------------

export async function createCheckout(productId: string, qty: number) {
  const db = getDb();
  const product = db.products.find(p => p.id === productId);
  if (!product) throw new Error('Unknown product');
  const ref = `pre-${newId()}`;
  const order = await paypal.createOrder({
    referenceId: ref,
    description: `${product.name} — pre-order, ships by ${fmt(product.promisedShipDate)}`,
    sku: product.sku,
    name: product.name,
    unitPrice: product.price,
    qty,
  });
  return { orderId: order.id, ref };
}

export async function captureCheckout(orderId: string, productId: string, qty: number, buyer?: { name?: string; email?: string }) {
  const db = getDb();
  const product = db.products.find(p => p.id === productId)!;
  const cap = await paypal.captureOrder(orderId);
  const pre: Preorder = {
    id: `po-cust-${newId().slice(0, 6)}`,
    productId,
    customerName: cap.payerName || buyer?.name || 'Sandbox Buyer',
    email: cap.payerEmail || buyer?.email || 'buyer@example.com',
    qty,
    amount: cap.amount || product.price * qty,
    createdAt: new Date().toISOString(),
    promisedDate: product.promisedShipDate,
    status: 'active',
    source: 'checkout',
    paypalOrderId: orderId,
    captureId: cap.captureId,
  };
  db.preorders.push(pre);
  log({ actor: 'customer', type: 'preorder', title: `New pre-order · ${pre.customerName} · $${pre.amount}`, detail: `PayPal capture ${cap.captureId}${paypalMode() === 'simulated' ? ' (simulated)' : ''}. Promised ship date ${fmt(pre.promisedDate)}.`, link: '/preorders' });
  save();
  changed('preorders');
  return pre;
}

export function noticeView(token: string) {
  const db = getDb();
  const pre = db.preorders.find(p => p.noticeToken === token);
  if (!pre) return null;
  const product = db.products.find(p => p.id === pre.productId)!;
  const proposal = db.proposals.find(p => p.status === 'approved' && p.poId === db.purchaseOrders.find(o => o.productId === product.id)?.id);
  return { preorder: pre, product: { name: product.name, image: product.image }, goodwillCredit: proposal?.goodwillCredit ?? 0, merchant: db.merchant.name };
}

export async function respondToNotice(token: string, choice: 'keep' | 'cancel') {
  const db = getDb();
  const pre = db.preorders.find(p => p.noticeToken === token);
  if (!pre) throw new Error('Unknown notice');
  if (pre.status === 'refunded' || pre.status === 'cancelled' || pre.status === 'kept') return pre;
  const view = noticeView(token)!;
  pre.responseAt = new Date().toISOString();
  if (choice === 'cancel') {
    const r = await paypal.refundCapture(pre.captureId ?? '', null, `Full refund for your Kiln & Co pre-order ${pre.id.toUpperCase()} — sorry for the delay.`, `refund-${pre.id}`);
    pre.status = 'refunded';
    pre.refundId = r.id;
    log({ actor: 'customer', type: 'refund', title: `${pre.customerName} cancelled · full refund $${pre.amount}`, detail: `PayPal refund ${r.id}${r.simulated ? ' (simulated: seeded order)' : ''}.`, link: '/preorders' });
  } else {
    pre.status = 'kept';
    pre.promisedDate = pre.revisedDate ?? pre.promisedDate;
    let detail = `New ship date ${fmt(pre.promisedDate)}.`;
    if (view.goodwillCredit > 0) {
      const r = await paypal.refundCapture(pre.captureId ?? '', view.goodwillCredit, `A $${view.goodwillCredit} thank-you for waiting — Kiln & Co`, `goodwill-${pre.id}`);
      pre.goodwillRefundId = r.id;
      detail += ` $${view.goodwillCredit} goodwill credit refunded via PayPal (${r.id}).`;
    }
    log({ actor: 'customer', type: 'kept', title: `${pre.customerName} is keeping their pre-order`, detail, link: '/preorders' });
  }
  save();
  changed('preorders');
  return pre;
}

// ---------------------------------------------------------------------------
// Goods received → ship pre-orders with tracking
// ---------------------------------------------------------------------------

export async function receiveShipment(launchTaskId: string) {
  const db = getDb();
  const tasks = scheduled(db);
  const launch = tasks.find(t => t.id === launchTaskId);
  if (!launch || launch.kind !== 'launch') throw new Error('Not a launch task');
  const po = db.purchaseOrders.find(o => o.id === launch.poId)!;
  const product = db.products.find(p => p.id === po.productId)!;
  const units = launch.id.endsWith('-air-launch') ? po.splitAirUnits ?? 0 : po.quantity - (po.splitAirUnits ?? 0);
  let stock = units;
  let shipped = 0, tracked = 0;
  const queue = db.preorders.filter(p => p.productId === product.id && (p.status === 'active' || p.status === 'kept')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const pre of queue) {
    if (stock < pre.qty) break;
    stock -= pre.qty;
    pre.status = 'shipped';
    pre.trackingNumber = `9400${Math.floor(1e15 + Math.random() * 9e15)}`.slice(0, 22);
    const r = await paypal.addTracking(pre.paypalOrderId ?? '', pre.captureId ?? '', pre.trackingNumber).catch(() => ({ simulated: true }));
    if (!r.simulated) tracked++;
    shipped++;
  }
  product.stockOnHand += stock;
  // Everything on this shipment's path up to the launch is now done.
  const done = new Set([launchTaskId]);
  const stack = [launchTaskId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const d of db.dependencies.filter(x => x.to === id)) if (!done.has(d.from)) { done.add(d.from); stack.push(d.from); }
  }
  for (const t of db.tasks) if (done.has(t.id)) t.percentDone = 100;
  if (!launch.id.endsWith('-air-launch')) po.status = 'received';
  log({ actor: 'system', type: 'received', title: `${units} ${product.name} units received`, detail: `Shipped ${shipped} pre-orders${tracked ? `, uploaded ${tracked} tracking numbers to PayPal (seller protection)` : ''}; ${stock} units back in stock.`, link: '/preorders' });
  const pod = db.payments.find(p => p.poId === po.id && p.gate === 'goods_received' && p.status === 'scheduled');
  save();
  if (pod) await releasePayment(pod.id, 'Goods received at warehouse.');
  changed('all');
  return { shipped, tracked, restocked: stock };
}

// ---------------------------------------------------------------------------
// PO intake → new project
// ---------------------------------------------------------------------------

export function commitIntake(intake: Intake) {
  const db = getDb();
  const x = intake.po;
  const poId = /^PO-/i.test(x.poNumber) ? x.poNumber.toUpperCase() : `PO-${x.poNumber}`;
  if (db.purchaseOrders.some(o => o.id === poId)) throw new Error(`${poId} already exists`);
  const p = poId.replace('PO-', '');
  const productId = x.sku.toLowerCase();
  if (!db.products.some(pr => pr.id === productId)) {
    db.products.push({ id: productId, name: x.productName, sku: x.sku, price: Math.round(x.unitCost * 3.2), image: '/samples/product-pour-over.png', stockOnHand: 0, dailyVelocity: 3, promisedShipDate: today(), preorderOpen: false, blurb: '' });
  }
  let supplier = db.suppliers.find(s => s.name === x.supplierName);
  if (!supplier) {
    supplier = { id: newId(), name: x.supplierName, country: x.supplierCountry, contact: x.supplierContact, paypalEmail: config.paypal.supplierEmail || 'supplier-sandbox@example.com' };
    db.suppliers.push(supplier);
    db.resources.push({ id: `r-${supplier.id}`, name: x.supplierName, role: 'Factory', country: x.supplierCountry });
  }
  db.purchaseOrders.push({
    id: poId,
    supplierId: supplier.id,
    productId,
    quantity: x.quantity,
    unitCost: x.unitCost,
    currency: x.currency,
    incoterm: x.incoterm,
    originPort: x.originPort,
    destinationPort: x.destinationPort,
    shipMode: x.shipMode,
    status: 'planned',
    spec: Object.fromEntries(x.spec.map(s => [s.key, s.value])),
    qcRequirements: x.qcRequirements,
  });
  const total = x.quantity * x.unitCost;
  const group = `g-${p}`;
  const tasks: Task[] = [{ id: group, poId, name: `${poId} · ${x.productName} × ${x.quantity.toLocaleString()} · ${x.originPort.split(' ')[0]} → ${x.destinationPort.split(' ')[0]}`, kind: 'group', duration: 0, percentDone: 0 }];
  const keyToId = (k: string) => `${p}-${k}`;
  const resourceFor: Record<string, string> = { production: `r-${supplier.id}`, qc: 'r-qc', freight: 'r-forwarder', air: 'r-forwarder', customs: 'r-customs', warehouse: 'r-wh', payment: 'r-merchant', launch: 'r-wh' };
  for (const pt of intake.plan.tasks) {
    const id = keyToId(pt.key);
    const t: Task = { id, poId, parentId: group, name: pt.name, kind: pt.kind, duration: pt.durationDays, percentDone: 0, resourceId: resourceFor[pt.kind], note: pt.why, addedBy: 'agent' };
    if (pt.kind === 'payment' && pt.paymentType !== 'none') {
      const pct = pt.paymentType === 'deposit' ? x.depositPct : pt.paymentType === 'balance' ? 100 - x.depositPct : 100;
      const pay: SupplierPayment = {
        id: `pay-${p}-${pt.key}`,
        poId,
        label: `${Math.round(pct)}% ${pt.paymentType === 'on_delivery' ? 'on delivery' : pt.paymentType}`,
        type: pt.paymentType,
        amount: Math.round((total * pct) / 100),
        currency: x.currency,
        status: 'scheduled',
        gate: pt.paymentType === 'balance' ? 'qc_pass' : pt.paymentType === 'on_delivery' ? 'goods_received' : 'none',
      };
      db.payments.push(pay);
      t.paymentId = pay.id;
    }
    if (!pt.dependsOn.length) t.snet = maxDateStr(x.orderDate, today());
    tasks.push(t);
  }
  db.tasks.push(...tasks);
  for (const pt of intake.plan.tasks) for (const dep of pt.dependsOn) db.dependencies.push({ id: `d-${keyToId(dep)}-${keyToId(pt.key)}`, from: keyToId(dep), to: keyToId(pt.key), lag: 0 });
  scheduled(db); // throws on cycles
  log({ actor: 'agent', type: 'intake', title: `${poId} planned from the purchase order`, detail: `${intake.plan.tasks.length} tasks, ${db.payments.filter(pp => pp.poId === poId).length} PayPal payment milestones gated on QC and delivery.`, link: '/timeline' });
  save();
  changed('all');
  return { poId };
}

function maxDateStr(a: string, b: string) {
  return a > b ? a : b;
}

export function modes() {
  return { ai: aiMode(), paypal: paypalMode(), model: config.model, today: today() };
}
