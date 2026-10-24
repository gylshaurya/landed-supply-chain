import { chromium } from '@playwright/test';
const [w, h, path, name] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], process.argv[5]];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173' + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
if (process.argv[6]) { await p.hover(process.argv[6]); await p.waitForTimeout(400); }
await p.screenshot({ path: `e2e/shots/${name}.png` });
console.log('ok', errs.join('|'));
await b.close();
