// Live PayPal sandbox check: card-funded order → capture → partial + full refund, payout status, tracking.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import * as pp from '../server/paypal.js';
const base = 'https://api-m.sandbox.paypal.com';
const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
const tok = (await (await fetch(`${base}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })).json()).access_token;
const res = await fetch(`${base}/v2/checkout/orders`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': randomUUID(), Prefer: 'return=representation' },
  body: JSON.stringify({
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: 'landed-live-test', amount: { currency_code: 'USD', value: '68.00' } }],
    payment_source: { card: { number: '4032039317984658', expiry: '2030-12', name: 'Landed Test', security_code: '123' } },
  }),
});
const order = await res.json();
console.log('card order', res.status, order.status, order.details?.[0]?.issue ?? '');
const capId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
console.log('capture', capId);
if (capId) {
  console.log('goodwill partial refund', await pp.refundCapture(capId, 5, 'Landed live test goodwill', randomUUID()));
  console.log('full-remaining refund', await pp.refundCapture(capId, 63, 'Landed live test cancel', randomUUID()));
}
const pay = await pp.payout({ receiver: process.env.PAYPAL_SUPPLIER_EMAIL!, amount: 12.34, note: 'Landed live payout test', senderItemId: `test-${Date.now()}`, subject: 'Landed test payout' });
console.log('payout', pay);
await new Promise(r => setTimeout(r, 4000));
console.log('payout status', await pp.payoutStatus(pay.batchId));
