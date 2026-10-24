import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://localhost:5173';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${base}/timeline`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
await p.locator('.b-chatbutton, .b-chat-button, [data-ref*=chat], button[aria-label*=Copilot]').first().click(); await p.waitForTimeout(2000);
console.log(await p.evaluate(() => [...document.querySelectorAll('textarea, input, [contenteditable=true]')].map(e => `${e.tagName} ${e.className} ${e.getAttribute('placeholder') ?? ''} visible=${!!e.offsetParent}`).join('\n')));
console.log(await p.evaluate(() => [...document.querySelectorAll('[class*=chat]')].slice(0, 12).map(e => e.className).join('\n')));
await p.screenshot({ path: 'e2e/shots-live/copilot-open.png' });
await b.close();
