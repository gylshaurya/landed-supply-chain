import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5173/timeline', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
await p.locator('.b-chat-button').first().click(); await p.waitForTimeout(1200);
const header = p.locator('.b-chat-popup .b-panel-header').first();
const box = await header.boundingBox();
await p.screenshot({ path: 'e2e/shots/chat-header.png', clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 120 } });
console.log(await p.evaluate(() => [...document.querySelectorAll('.b-chat-popup .b-panel-header .b-tool, .b-chat-popup .b-panel-header button, .b-chat-popup .b-panel-header [class*=b-icon]')].map(e => `${e.className} | title=${e.getAttribute('data-btip') || e.getAttribute('aria-label') || e.getAttribute('title') || ''} | ref=${e.dataset.ref || ''}`).join('\n')));
await b.close();
