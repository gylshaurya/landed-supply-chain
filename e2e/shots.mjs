import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://localhost:5173';
const pages = (process.argv[2] || '/,/timeline,/runway,/preorders,/payments,/intake,/store,/portal/PO-1042').split(',');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });
page.on('pageerror', e => errors.push(`${page.url()} :: PAGEERROR ${e.message}`));
for (const p of pages) {
  await page.goto(base + p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const name = p === '/' ? 'home' : p.replace(/\//g, '_').replace(/^_/, '');
  await page.screenshot({ path: `e2e/shots/${name}.png` });
  console.log('shot', name);
}
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
