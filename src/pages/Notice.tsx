import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDate, usd } from '../lib/api';
import { Icon } from '../components/Icon';

export function Notice() {
  const { token } = useParams();
  const [qs] = useSearchParams();
  const [v, setV] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const suggested = qs.get('choice');

  useEffect(() => {
    api(`/api/notice/${token}`).then(setV).catch(e => setErr(e.message));
  }, [token]);

  async function choose(choice: 'keep' | 'cancel') {
    setBusy(choice);
    try {
      const pre = await api(`/api/notice/${token}`, { method: 'POST', json: { choice } });
      setV((x: any) => ({ ...x, preorder: pre }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (err) return <div className="standalone shop"><div className="standalone-body"><div className="card empty">{err}</div></div></div>;
  if (!v) return <div className="standalone shop"><div className="standalone-body empty">Loading…</div></div>;
  const p = v.preorder;
  const done = p.status === 'kept' || p.status === 'refunded';
  return (
    <div className="standalone shop">
      <div className="standalone-top"><span className="serif" style={{ fontSize: 22 }}>{v.merchant}</span></div>
      <div className="standalone-body" style={{ maxWidth: 640 }}>
        <div className="card">
          <img src={v.product.image} alt="" style={{ width: '100%', borderRadius: '14px 14px 0 0', display: 'block', maxHeight: 260, objectFit: 'cover' }} />
          <div className="card-b stack" style={{ padding: 24 }}>
            <h1 className="serif" style={{ fontSize: 26, fontWeight: 600 }}>Your pre-order is running late</h1>
            <p>Hi {p.customerName.split(' ')[0]}, our kiln partner hit a production delay. Your <b>{v.product.name}</b> (order {p.id.toUpperCase()}) will now ship on <b>{fmtDate(p.revisedDate ?? p.promisedDate, { weekday: 'long', month: 'long', day: 'numeric' })}</b> instead of {fmtDate(p.originalPromisedDate ?? p.promisedDate, { month: 'long', day: 'numeric' })}.</p>
            {!done && (
              <>
                <p className="muted small">You choose. Cancelling is free and refunds the full {usd(p.amount)} to your PayPal account right away.</p>
                <div className="grid cols-2">
                  <button className={`btn lg ${suggested === 'keep' ? 'primary' : ''}`} onClick={() => choose('keep')} disabled={!!busy}>
                    {busy === 'keep' ? <Icon name="spinner" spin /> : <Icon name="heart" />} Keep my order{v.goodwillCredit > 0 ? ` (+${usd(v.goodwillCredit)} back)` : ''}
                  </button>
                  <button className={`btn lg ${suggested === 'cancel' ? 'paypal' : ''}`} onClick={() => choose('cancel')} disabled={!!busy}>
                    {busy === 'cancel' ? <Icon name="spinner" spin /> : <Icon name="reset" />} Cancel · full refund
                  </button>
                </div>
              </>
            )}
            {p.status === 'kept' && (
              <div className="hero-alert good">
                <b>Thanks for waiting!</b>
                <span>Your order is confirmed for {fmtDate(p.promisedDate, { month: 'long', day: 'numeric' })}.{p.goodwillRefundId ? ` We've refunded ${usd(v.goodwillCredit)} to your PayPal account as a thank-you (ref ${p.goodwillRefundId}).` : ''}</span>
              </div>
            )}
            {p.status === 'refunded' && (
              <div className="hero-alert good">
                <b>Refund sent</b>
                <span>{usd(p.amount)} is on its way back to your PayPal account. PayPal refund reference <span className="mono">{p.refundId}</span>.</span>
              </div>
            )}
            {p.status === 'shipped' && <div className="hero-alert good"><b>Good news — it already shipped!</b><span>Tracking {p.trackingNumber}</span></div>}
          </div>
        </div>
        <p className="muted tiny" style={{ marginTop: 12, textAlign: 'center' }}>Sent under the FTC Mail Order Rule: you were told before the original date and offered a free, full refund.</p>
      </div>
    </div>
  );
}
