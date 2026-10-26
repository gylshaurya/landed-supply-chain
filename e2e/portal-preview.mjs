import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/portal/PO-1042', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
await p.locator('input[type=file]').setInputFiles(['public/samples/qc-good-1.jpg', 'public/samples/qc-good-2.png', 'public/samples/golden-sample.jpg']);
await p.waitForTimeout(800);
await p.screenshot({ path: 'e2e/shots/portal-preview.png' });
console.log('previews', await p.locator('.preview').count(), 'errors', errs.join('|'));
await b.close();
