import 'dotenv/config';
const base = 'https://api-m.sandbox.paypal.com';
const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
const t = (await (await fetch(`${base}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })).json()).access_token;
for (const p of ['/v1/reporting/balances?currency_code=ALL', '/v1/identity/openidconnect/userinfo?schema=openid']) {
  const r = await fetch(base + p, { headers: { Authorization: `Bearer ${t}` } });
  console.log(p, r.status, (await r.text()).slice(0, 500));
}
