import { Link } from 'react-router-dom';
import { useApp } from '../lib/store';
import { daysBetween, fmtDate, usd } from '../lib/api';
import { Feed } from '../components/Feed';
import { DelayComposer, RecoverButton } from '../components/DelayComposer';

export function CommandCenter() {
  const { state } = useApp();
  if (!state) return <div className="empty">Loading…</div>;
  const k = state.kpis;
  const pending = state.proposals.filter((p: any) => p.status === 'pending');
  const lateDays = daysBetween(k.heroLaunch, k.heroPromise);
  const hero = state.purchaseOrders[0];
  return (
    <div className="grid" style={{ gap: 18 }}>
      {pending.length > 0 ? (
        <div className="hero-alert">
          <div className="row">
            <span className="badge amber"><span className="dot" /> Needs your decision</span>
            <span className="muted small">{pending[0].poId}</span>
          </div>
          <h2 style={{ fontSize: 19 }}>{pending[0].headline}</h2>
          <div className="row">
            <Link className="btn primary lg" to={`/proposals/${pending[0].id}`}><i className="fa fa-clipboard-check" /> Review recovery plan</Link>
            <span className="muted small">Nothing changes until you approve.</span>
          </div>
        </div>
      ) : k.heroAtRisk > 0 && !hero.keyDates?.airLaunch ? (
        <div className="hero-alert">
          <div className="row">
            <span className="badge red"><span className="dot" /> Promises at risk</span>
            <span className="muted small">{state.daysToBlackFriday} days to Black Friday</span>
          </div>
          <h2 style={{ fontSize: 19 }}>The current timeline ships PO-1042 on {fmtDate(hero.keyDates?.launch)} — {k.heroAtRisk} pre-orders would miss their promised date.</h2>
          <RecoverButton />
        </div>
      ) : (
        <div className={`hero-alert ${lateDays <= 0 ? 'good' : ''}`}>
          <div className="row">
            <span className={`badge ${lateDays <= 0 ? 'green' : 'amber'}`}><span className="dot" />{lateDays <= 0 ? 'On track' : 'Recovering'}</span>
            <span className="muted small">{state.daysToBlackFriday} days to Black Friday ({fmtDate(state.blackFriday)})</span>
          </div>
          <h2 style={{ fontSize: 19 }}>
            {hero.keyDates?.airLaunch
              ? `Pour-over pre-orders ship ${fmtDate(hero.keyDates.airLaunch)} from air freight; the rest of PO-1042 lands ${fmtDate(hero.keyDates.launch)}.`
              : `PO-1042 lands ${fmtDate(hero.keyDates?.launch)} — ${k.preorders} pre-orders promised to ship by ${fmtDate(k.heroPromise)}.`}
          </h2>
          <details>
            <summary className="small strong" style={{ cursor: 'pointer' }}>Simulate a supplier message (what the factory would send)</summary>
            <div style={{ marginTop: 12 }}>
              <DelayComposer />
            </div>
          </details>
        </div>
      )}

      <div className="grid cols-4">
        <div className="card kpi">
          <div className="label">Open pre-orders</div>
          <div className="value">{k.preorders}</div>
          <div className="foot">{usd(k.preorderRevenue)} captured with PayPal</div>
        </div>
        <div className="card kpi">
          <div className="label">Next pour-over ship date</div>
          <div className="value">{fmtDate(k.heroLaunch)}</div>
          <div className="foot">
            Promise to new buyers: {fmtDate(k.heroPromise)}
            {lateDays > 0 ? <span className="badge red" style={{ marginLeft: 6 }}>{lateDays}d late</span> : null}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Paid to suppliers</div>
          <div className="value">{usd(k.committedToSuppliers)}</div>
          <div className="foot">via PayPal Payouts</div>
        </div>
        <div className="card kpi">
          <div className="label">Held until goods pass QC</div>
          <div className="value">{usd(k.heldOrScheduled)}</div>
          <div className="foot">{k.awaitingResponse ? `${k.awaitingResponse} customers deciding · ${k.kept} kept · ${k.refunded} refunded` : 'Released automatically by the QC agent'}</div>
        </div>
      </div>

      <div className="grid cols-main">
        <div className="card">
          <div className="card-h">
            <h2>Inbound shipments</h2>
            <div className="spacer" />
            <Link to="/timeline" className="btn sm">Open timeline</Link>
          </div>
          {state.purchaseOrders.map((po: any) => {
            const product = state.products.find((p: any) => p.id === po.productId);
            const supplier = state.suppliers.find((s: any) => s.id === po.supplierId);
            return (
              <div className="po-row" key={po.id}>
                <div>
                  <div className="strong">{po.id} · {product?.name} × {po.quantity.toLocaleString()}</div>
                  <div className="muted small">{supplier?.name} · {po.originPort} → {po.destinationPort}</div>
                </div>
                <div>
                  <div className="bar"><span style={{ width: `${po.progress}%` }} /></div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>{po.progress}% complete</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="strong">{fmtDate(po.keyDates?.airLaunch ?? po.keyDates?.launch)}</div>
                  <div className="tiny muted">{po.keyDates?.airLaunch ? `air · sea ${fmtDate(po.keyDates.launch)}` : 'restock live'}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <div className="card-h">
            <h2>Live activity</h2>
            <div className="spacer" />
            <Link to="/outbox" className="btn sm ghost">Outbox ({state.outboxCount})</Link>
          </div>
          <Feed items={state.activity} limit={9} />
        </div>
      </div>
    </div>
  );
}
