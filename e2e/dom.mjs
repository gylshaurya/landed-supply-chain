import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5173' + (process.argv[2] || '/timeline'), { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
console.log(await p.evaluate(sel => [...document.querySelectorAll(sel)].slice(0, 8).map(e => e.className + ' :: ' + getComputedStyle(e).borderLeftColor + ' ' + getComputedStyle(e).backgroundColor).join('\n'), process.argv[3] || '[class*=timerange], [class*=time-range]'));
await b.close();
