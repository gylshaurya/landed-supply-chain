import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(process.argv[2]), height: 800 } });
await p.goto('http://localhost:5173' + (process.argv[3] || '/'), { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
console.log(await p.evaluate(sel => {
  const root = document.querySelector(sel); const r = root.getBoundingClientRect();
  return [...root.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > r.right + 1).slice(0, 10).map(e => `${e.tagName}.${String(e.className).slice(0, 30)} right=${Math.round(e.getBoundingClientRect().right)} vs ${Math.round(r.right)} text=${(e.textContent || '').trim().slice(0, 30)}`).join('\n');
}, process.argv[4] || '.cc-right .card'));
await b.close();
