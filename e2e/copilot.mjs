import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://localhost:5173';
await fetch(`${base}/api/admin/reset`, { method: 'POST' });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(`${base}/timeline`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
const btn = p.locator('.b-chatbutton, .b-chat-button, [data-ref*=chat], button[aria-label*=Copilot]').first();
console.log('chat buttons', await btn.count());
await btn.click(); await p.waitForTimeout(1500);
const input = p.locator('.b-chat-popup .b-display-field-value').first();
console.log('inputs', await input.count());
const ask = async q => {
  await input.click(); await p.keyboard.type(q); await p.keyboard.press('Enter');
  const t = Date.now();
  const before = await p.locator('.b-chat-bubbles').innerText();
  for (let i = 0; i < 45; i++) { await p.waitForTimeout(2000); const now = await p.locator('.b-chat-bubbles').innerText(); if (now.length > before.length + q.length + 40 && !/waiting/i.test(now.slice(-60))) break; }
  await p.waitForTimeout(4000);
  console.log(`Q: ${q} (${Date.now() - t}ms)`);
};
await ask('What if the factory slips 8 more days on PO-1042 and we air-freight 120 units?');
await ask('Which PayPal payments are not paid yet?');
const text = await p.locator('.b-chat-bubbles').innerText();
console.log('--- panel text ---\n' + text.slice(-2500));
await p.screenshot({ path: 'e2e/shots-live/copilot.png' });
console.log('errors:', errs.slice(0, 5).join('\n'));
await b.close();
