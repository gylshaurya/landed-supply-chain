import { useEffect, useRef, useState } from 'react';
import { api, fmtDate, usd } from '../lib/api';
import { useApp } from '../lib/store';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'paypal-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string; hidden?: boolean };
      'paypal-pay-later-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { hidden?: boolean };
    }
  }
  interface Window {
    paypal?: any;
  }
}

const SDK_URL = 'https://www.sandbox.paypal.com/web-sdk/v6/core';

function loadSdk(): Promise<void> {
  if (window.paypal?.createInstance) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the PayPal SDK'));
    document.head.appendChild(s);
  });
}

export function Store() {
  const { state } = useApp();
  const [qty, setQty] = useState(1);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; text?: string; pre?: any }>({ kind: 'idle' });
  const [sdkReady, setSdkReady] = useState(false);
  const qtyRef = useRef(qty);
  qtyRef.current = qty;
  const product = state?.products.find((p: any) => p.id === 'pour-over');
  const mode: string | undefined = state?.modes.paypal;

  async function createOrder() {
    const r = await api('/api/store/orders', { method: 'POST', json: { productId: 'pour-over', qty: qtyRef.current } });
    return { orderId: r.orderId as string };
  }

  async function capture(orderId: string) {
    setStatus({ kind: 'busy', text: 'Capturing payment…' });
    const pre = await api(`/api/store/orders/${orderId}/capture`, { method: 'POST', json: { productId: 'pour-over', qty: qtyRef.current } });
    setStatus({ kind: 'done', pre });
  }

  // PayPal JS SDK v6: createInstance → findEligibleMethods → payment sessions bound to web-component buttons.
  useEffect(() => {
    if (mode !== 'sandbox') return;
    let cancelled = false;
    (async () => {
      try {
        const { clientId } = await api('/api/paypal/config');
        await loadSdk();
        if (cancelled) return;
        const sdk = await window.paypal.createInstance({ clientId, components: ['paypal-payments'], pageType: 'checkout' });
        const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' });
        const options = {
          onApprove: async (data: { orderId: string }) => capture(data.orderId).catch(e => setStatus({ kind: 'error', text: e.message })),
          onCancel: () => setStatus({ kind: 'idle' }),
          onError: (e: Error) => setStatus({ kind: 'error', text: e.message }),
        };
        const wire = (selector: string, session: any) => {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (!el) return;
          el.removeAttribute('hidden');
          el.addEventListener('click', async () => {
            try {
              // Pass the promise without awaiting so the popup keeps its user-activation.
              await session.start({ presentationMode: 'auto' }, createOrder());
            } catch (e) {
              setStatus({ kind: 'error', text: (e as Error).message });
            }
          });
        };
        if (methods.isEligible('paypal')) wire('#paypal-button', sdk.createPayPalOneTimePaymentSession(options));
        if (methods.isEligible('paylater')) {
          const details = methods.getDetails('paylater');
          const btn = document.querySelector('#paylater-button') as any;
          if (btn) {
            btn.productCode = details.productCode;
            btn.countryCode = details.countryCode;
          }
          wire('#paylater-button', sdk.createPayLaterOneTimePaymentSession(options));
        }
        setSdkReady(true);
      } catch (e) {
        setStatus({ kind: 'error', text: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function simulatedCheckout() {
    setStatus({ kind: 'busy', text: 'Creating PayPal order…' });
    try {
      const { orderId } = await createOrder();
      await capture(orderId);
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  }

  if (!state || !product) return <div className="standalone"><div className="standalone-body empty">Loading…</div></div>;
  return (
    <div className="standalone">
      {mode !== 'sandbox' && <div className="demo-banner">PayPal is in simulated mode — add sandbox credentials to .env for real PayPal checkout.</div>}
      <div className="standalone-top">
        <span className="serif" style={{ fontSize: 24 }}>Kiln & Co</span>
        <span className="muted small">Slow coffee, made by hand</span>
        <div style={{ flex: 1 }} />
        <span className="muted small">Shop · Journal · About</span>
      </div>
      <div className="standalone-body">
        <div className="store-grid">
          <img className="store-img" src={product.image} alt={product.name} />
          <div className="stack" style={{ gap: 16 }}>
            <span className="badge amber" style={{ width: 'fit-content' }}>Sold out · pre-order the next kiln batch</span>
            <h1 className="serif" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.15 }}>{product.name}</h1>
            <div className="price">{usd(product.price)}</div>
            <p className="muted">{product.blurb}</p>
            <div className="ship-promise">
              <i className="fa fa-truck-fast" style={{ color: '#14532d' }} />
              <div>
                <div className="strong">Ships by {fmtDate(product.promisedShipDate, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                <div className="muted tiny">This date updates live from our supply timeline. If it ever slips, we'll tell you first and you can cancel for a full refund.</div>
              </div>
            </div>
            <div className="row">
              <span className="small strong">Qty</span>
              <select className="input" style={{ width: 80 }} value={qty} onChange={e => setQty(Number(e.target.value))}>
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="muted small">Total {usd(product.price * qty)}</span>
            </div>
            {status.kind !== 'done' && (
              <div className="pp-buttons">
                {mode === 'sandbox' ? (
                  <>
                    <paypal-button id="paypal-button" type="pay" hidden />
                    <paypal-pay-later-button id="paylater-button" hidden />
                    {!sdkReady && status.kind !== 'error' && <span className="muted small"><i className="fa fa-circle-notch fa-spin" /> Loading PayPal…</span>}
                  </>
                ) : (
                  <button className="btn paypal lg" onClick={simulatedCheckout} disabled={status.kind === 'busy'}>
                    Pay with PayPal (simulated)
                  </button>
                )}
              </div>
            )}
            {status.kind === 'busy' && <div className="muted small"><i className="fa fa-circle-notch fa-spin" /> {status.text}</div>}
            {status.kind === 'error' && <div className="badge red" style={{ whiteSpace: 'normal' }}>{status.text}</div>}
            {status.kind === 'done' && (
              <div className="hero-alert good">
                <b>Pre-order confirmed — thank you, {status.pre.customerName.split(' ')[0]}!</b>
                <span className="small">Paid {usd(status.pre.amount)} with PayPal · capture <span className="mono">{status.pre.captureId}</span>. Ships by {fmtDate(status.pre.promisedDate, { month: 'long', day: 'numeric' })}.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
