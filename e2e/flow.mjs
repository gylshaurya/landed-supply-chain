// Drives the full demo story in a real browser and saves screenshots.
import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.OUT || 'e2e/shots';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`PAGEERROR ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()}`); });
const shot = async (n, full = false) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/${n}.png`, fullPage: full }); console.log('shot', n); };
const t0 = Date.now();
const step = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

await fetch(`${base}/api/admin/reset`, { method: 'POST' });
step('reset');

// 1. Supplier delay → agent → proposal
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.getByText('Simulate a supplier message').click();
await page.getByRole('button', { name: 'Send update to Landed' }).click();
await page.getByText('Review recovery plan').first().waitFor({ timeout: 240_000 });
step('proposal ready');
await shot('flow-1-agent');
await page.getByText('Review recovery plan').first().click();
await page.getByRole('button', { name: /Approve & execute/ }).waitFor();
await shot('flow-2-proposal', true);

// 2. Approve
await page.getByRole('button', { name: /Approve & execute/ }).click();
await page.getByText('Approved & executed').waitFor({ timeout: 60_000 });
step('approved');
await shot('flow-3-approved', true);

await page.goto(base + '/timeline', { waitUntil: 'networkidle' });
await shot('flow-4-timeline');
await page.goto(base + '/runway', { waitUntil: 'networkidle' });
await shot('flow-5-runway');
await page.goto(base + '/outbox', { waitUntil: 'networkidle' });
await shot('flow-6-outbox');

// 3. Customers respond to the notice
const pre = await (await fetch(`${base}/api/preorders`)).json();
const noticed = pre.filter(p => p.noticeToken);
step(`notices: ${noticed.length}`);
if (noticed.length) {
  await page.goto(`${base}/notice/${noticed[0].noticeToken}?choice=cancel`, { waitUntil: 'networkidle' });
  await shot('flow-7-notice');
  await page.getByRole('button', { name: /Cancel · full refund/ }).click();
  await page.getByText('Refund sent').waitFor();
  await shot('flow-8-refunded');
  await page.goto(`${base}/notice/${noticed[1].noticeToken}?choice=keep`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Keep my order/ }).click();
  await page.getByText('Thanks for waiting').waitFor();
  await shot('flow-9-kept');
}

// 4. QC: defective batch held, good batch releases the PayPal payout
await page.goto(`${base}/portal/PO-1042`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Batch with defects' }).click();
await page.getByRole('button', { name: /Submit for inspection/ }).click();
await page.getByText(/Balance held|Waiting for review/).first().waitFor({ timeout: 240_000 });
step('qc bad done');
await shot('flow-10-qc-fail', true);
await page.getByRole('button', { name: 'Batch that matches spec' }).click();
await page.getByRole('button', { name: /Submit for inspection/ }).click();
await page.getByText('Balance released via PayPal').first().waitFor({ timeout: 240_000 });
step('qc good done');
await shot('flow-11-qc-pass', true);

// 5. Storefront checkout (simulated or sandbox button presence)
await page.goto(`${base}/store`, { waitUntil: 'networkidle' });
const sim = page.getByRole('button', { name: /Pay with PayPal \(simulated\)/ });
if (await sim.count()) {
  await sim.click();
  await page.getByText(/Pre-order confirmed/).waitFor();
}
await shot('flow-12-store');

// 6. PO intake
await page.goto(`${base}/intake`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Use sample PO-1045/ }).click();
await page.getByRole('button', { name: /Add to timeline/ }).waitFor({ timeout: 240_000 });
step('intake read');
await shot('flow-13-intake', true);
await page.getByRole('button', { name: /Add to timeline/ }).click();
await page.waitForURL('**/timeline');
await shot('flow-14-timeline-new-po');

await page.goto(base + '/', { waitUntil: 'networkidle' });
await shot('flow-15-home-after', true);
const state = await (await fetch(`${base}/api/state`)).json();
console.log('KPIS', JSON.stringify(state.kpis));
console.log('PAYMENTS', state.payments.map(p => `${p.id}:${p.status}`).join(' '));
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
