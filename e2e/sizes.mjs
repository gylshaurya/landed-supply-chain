import { chromium } from '@playwright/test';
const sizes = (process.argv[2] || '1280x800,1366x768,1536x864').split(',').map(s => s.split('x').map(Number));
const pages = (process.argv[3] || '/,/timeline,/payments,/intake,/outbox,/preorders').split(',');
const b = await chromium.launch();
for (const [w, h] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  for (const path of pages) {
    await p.goto('http://localhost:5173' + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    // report elements whose content overflows their box horizontally
    const over = await p.evaluate(() => [...document.querySelectorAll('.main *')].filter(e => { const s = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 2 && s.overflowX === 'visible' && e.clientWidth > 0 && !e.closest('.b-widget'); }).slice(0, 8).map(e => `${e.tagName}.${String(e.className).slice(0, 40)} ${e.clientWidth}->${e.scrollWidth}`));
    const name = `sz-${w}${path.replace(/\//g, '_') || '_home'}`;
    await p.screenshot({ path: `e2e/shots/${name}.png`, fullPage: false });
    console.log(name, over.length ? over.join(' | ') : 'no overflow');
  }
  await p.close();
}
await b.close();
