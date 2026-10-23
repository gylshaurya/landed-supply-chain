import { randomUUID } from 'node:crypto';
import { config, paypalMode } from './config.js';
import { newId } from './db.js';

// Thin PayPal REST client (sandbox). Covers what Landed needs:
//   Orders v2 (create / capture / add tracking), Payments v2 (refunds),
//   Payouts v1 (supplier payments). When no credentials are configured every
//   call is simulated with clearly-marked SIM-* ids so the app still runs.

export class PayPalError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

let cached: { token: string; expires: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${config.paypal.base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials',
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new PayPalError(json.error_description || 'PayPal auth failed', res.status, json);
  cached = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 3000) * 1000 };
  return cached.token;
}

async function call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${config.paypal.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
      ...(idempotencyKey ? { 'PayPal-Request-Id': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json?.details?.[0]?.description || json?.details?.[0]?.issue || json?.message || json?.error_description || res.statusText;
    throw new PayPalError(`PayPal ${method} ${path} failed: ${detail}`, res.status, json);
  }
  return json as T;
}

const sim = (prefix: string) => `SIM-${prefix}-${newId().toUpperCase()}`;
const money = (n: number) => n.toFixed(2);

export interface CreatedOrder {
  id: string;
  status: string;
}

export async function createOrder(input: { referenceId: string; description: string; sku: string; name: string; unitPrice: number; qty: number }): Promise<CreatedOrder> {
  if (paypalMode() === 'simulated') return { id: sim('ORDER'), status: 'CREATED' };
  const total = input.unitPrice * input.qty;
  return call<CreatedOrder>('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: input.referenceId,
        custom_id: input.referenceId,
        description: input.description,
        soft_descriptor: 'KILN AND CO',
        amount: {
          currency_code: 'USD',
          value: money(total),
          breakdown: { item_total: { currency_code: 'USD', value: money(total) } },
        },
        items: [
          { name: input.name, sku: input.sku, quantity: String(input.qty), category: 'PHYSICAL_GOODS', unit_amount: { currency_code: 'USD', value: money(input.unitPrice) } },
        ],
      },
    ],
  }, randomUUID());
}

export interface CaptureResult {
  orderId: string;
  status: string;
  captureId: string;
  payerName?: string;
  payerEmail?: string;
  amount: number;
}

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  if (paypalMode() === 'simulated' || orderId.startsWith('SIM-')) {
    return { orderId, status: 'COMPLETED', captureId: sim('CAPTURE'), payerName: 'Sandbox Buyer', payerEmail: 'buyer@example.com', amount: 0 };
  }
  type Resp = {
    id: string;
    status: string;
    payer?: { name?: { given_name?: string; surname?: string }; email_address?: string };
    purchase_units: { payments?: { captures?: { id: string; amount: { value: string } }[] } }[];
  };
  const r = await call<Resp>('POST', `/v2/checkout/orders/${orderId}/capture`, {}, randomUUID());
  const cap = r.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    orderId: r.id,
    status: r.status,
    captureId: cap?.id ?? '',
    payerName: [r.payer?.name?.given_name, r.payer?.name?.surname].filter(Boolean).join(' ') || undefined,
    payerEmail: r.payer?.email_address,
    amount: Number(cap?.amount.value ?? 0),
  };
}

export async function refundCapture(captureId: string, amount: number | null, note: string, key: string): Promise<{ id: string; status: string; simulated: boolean }> {
  if (paypalMode() === 'simulated' || !captureId || captureId.startsWith('SIM-')) {
    return { id: sim('REFUND'), status: 'COMPLETED', simulated: true };
  }
  const body: Record<string, unknown> = { note_to_payer: note.slice(0, 255) };
  if (amount !== null) body.amount = { currency_code: 'USD', value: money(amount) };
  const r = await call<{ id: string; status: string }>('POST', `/v2/payments/captures/${captureId}/refund`, body, key);
  return { ...r, simulated: false };
}

export async function payout(input: { receiver: string; amount: number; note: string; senderItemId: string; subject: string }): Promise<{ batchId: string; itemId?: string; status: string; simulated: boolean }> {
  if (paypalMode() === 'simulated') {
    return { batchId: sim('PAYOUT'), status: 'SUCCESS', simulated: true };
  }
  type Resp = { batch_header: { payout_batch_id: string; batch_status: string }; items?: { payout_item_id: string }[] };
  const r = await call<Resp>('POST', '/v1/payments/payouts', {
    sender_batch_header: {
      sender_batch_id: `landed-${input.senderItemId}-${Date.now()}`,
      email_subject: input.subject,
      email_message: input.note,
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: { value: money(input.amount), currency: 'USD' },
        receiver: input.receiver,
        note: input.note.slice(0, 4000),
        sender_item_id: input.senderItemId,
      },
    ],
  });
  return { batchId: r.batch_header.payout_batch_id, itemId: r.items?.[0]?.payout_item_id, status: r.batch_header.batch_status, simulated: false };
}

export async function payoutStatus(batchId: string): Promise<string> {
  if (paypalMode() === 'simulated' || batchId.startsWith('SIM-')) return 'SUCCESS';
  const r = await call<{ batch_header: { batch_status: string } }>('GET', `/v1/payments/payouts/${batchId}`);
  return r.batch_header.batch_status;
}

export async function addTracking(orderId: string, captureId: string, trackingNumber: string, carrier = 'USPS'): Promise<{ simulated: boolean }> {
  if (paypalMode() === 'simulated' || orderId.startsWith('SIM-') || !captureId || captureId.startsWith('SIM-')) return { simulated: true };
  await call('POST', `/v2/checkout/orders/${orderId}/track`, { capture_id: captureId, tracking_number: trackingNumber, carrier, notify_payer: true }, randomUUID());
  return { simulated: false };
}

export async function ping(): Promise<{ ok: boolean; mode: string; error?: string }> {
  if (paypalMode() === 'simulated') return { ok: true, mode: 'simulated' };
  try {
    await token();
    return { ok: true, mode: 'sandbox' };
  } catch (e) {
    return { ok: false, mode: 'sandbox', error: (e as Error).message };
  }
}
