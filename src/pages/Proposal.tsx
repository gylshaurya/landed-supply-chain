import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, usd } from '../lib/api';
import { useApp } from '../lib/store';
import { LandedGantt } from '../components/LandedGantt';
import { toast } from '../components/Toast';

export function ProposalPage() {
  const { id } = useParams();
  const { state, version } = useApp();
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api(`/api/proposals/${id}`).then(setP);
  }, [id, version]);

  if (!p || !state) return <div className="empty">Loading…</div>;
  const best = p.options.find((o: any) => o.key === p.recommendedKey);
  const wait = p.options.find((o: any) => /wait/i.test(o.label)) ?? p.options[0];
  const sample = p.customerNotice.body
    .replace(/\{\{name\}\}/g, 'Maya')
    .replace(/\{\{order_id\}\}/g, 'PO-CUST-142')
    .replace(/\{\{original_date\}\}/g, 'Thursday, November 26, 2026')
    .replace(/\{\{revised_date\}\}/g, best.fullRestockDate ? fmtDate(best.fullRestockDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '…')
    .replace(/\{\{keep_link\}\}/g, '[Keep my order]')
    .replace(/\{\{cancel_link\}\}/g, '[Cancel for a full refund]');

  async function approve() {
    setBusy(true);
    try {
      const r = await api(`/api/proposals/${id}/approve`, { method: 'POST' });
      setP(r);
      toast('Plan approved — schedule, PayPal payments and customer notices updated.');
    } finally {
      setBusy(false);
    }
  }
  async function reject() {
    setP(await api(`/api/proposals/${id}/reject`, { method: 'POST' }));
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className={`hero-alert ${p.status === 'approved' ? 'good' : ''}`}>
        <div className="row">
          <span className={`badge ${p.status === 'pending' ? 'amber' : p.status === 'approved' ? 'green' : ''}`}>
            <span className="dot" /> {p.status === 'pending' ? 'Waiting for your approval' : p.status === 'approved' ? 'Approved & executed' : 'Dismissed'}
          </span>
          <span className="muted small">{p.poId} · triggered by a supplier message</span>
          {p.source === 'demo' && <span className="badge amber">Demo AI (recorded)</span>}
        </div>
        <h2 style={{ fontSize: 20, lineHeight: 1.3 }}>{p.headline}</h2>
        <blockquote style={{ margin: 0, padding: '10px 14px', borderLeft: '3px solid #f59e0b', background: '#fff', borderRadius: 8 }} className="small">
          “{p.trigger.message}”
          <div className="muted tiny" style={{ marginTop: 6 }}>
            Understood as: +{p.trigger.delayDays} days on production — {p.trigger.reason}
            {p.trigger.supplierOffer ? ` · offer: ${p.trigger.supplierOffer.overtimeDays} days back for ${usd(p.trigger.supplierOffer.overtimeCost)}` : ''}
          </div>
        </blockquote>
        {p.status === 'pending' && (
          <div className="row">
            <button className="btn primary lg" onClick={approve} disabled={busy}>
              {busy ? <i className="fa fa-circle-notch fa-spin" /> : <i className="fa fa-check" />} Approve & execute
            </button>
            <button className="btn lg" onClick={reject} disabled={busy}>Dismiss</button>
            <span className="muted small">
              Approving will re-plan the timeline{best.overtimeCost ? `, pay ${usd(best.overtimeCost)} overtime via PayPal Payouts` : ''}
              {best.airUnits ? `, book ${best.airUnits} units on air freight` : ''}{best.preordersLate ? `, and send ${best.preordersLate} FTC-compliant notices with one-click PayPal refunds` : ''}.
            </span>
          </div>
        )}
        {p.status === 'approved' && (
          <div className="stack">
            {p.executionLog?.map((l: string) => (
              <div className="check ok" key={l}><i className="fa fa-circle-check" /><span>{l}</span></div>
            ))}
            <div className="row">
              <Link className="btn" to="/timeline"><i className="fa fa-bars-staggered" /> See the new timeline</Link>
              <Link className="btn" to="/preorders"><i className="fa fa-receipt" /> Pre-orders</Link>
              <Link className="btn" to="/outbox"><i className="fa fa-paper-plane" /> Sent notices</Link>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Options the agent simulated</h2>
          <span className="muted small">Each row is a full re-run of the schedule engine + demand model</span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Option</th><th>First units ship</th><th>All units land</th><th className="r">Late pre-orders</th><th className="r">Lost sales</th><th className="r">Exp. refunds</th><th className="r">Extra cost</th><th className="r">Broken-promise cost</th><th className="r">Total impact</th><th className="r">vs waiting</th>
            </tr>
          </thead>
          <tbody>
            {p.options.map((o: any) => (
              <tr key={o.key} className={o.key === p.recommendedKey ? 'best' : ''}>
                <td className="strong">
                  {o.key === p.recommendedKey && <i className="fa fa-star" style={{ color: '#16a34a', marginRight: 6 }} />}
                  {o.label}
                </td>
                <td>{fmtDate(o.firstShipDate)} {o.hitsBlackFriday ? <span className="badge green">before BF</span> : <span className="badge red">after BF</span>}</td>
                <td>{fmtDate(o.fullRestockDate)}</td>
                <td className="r num">{o.preordersLate}</td>
                <td className="r num">{usd(o.lostRevenue)}</td>
                <td className="r num">{usd(o.expectedRefunds)}</td>
                <td className="r num">{usd(o.airCost + o.overtimeCost + o.goodwillCost)}</td>
                <td className="r num">{usd(o.brokenPromiseCost ?? 0)}</td>
                <td className="r num strong">{usd(o.totalImpact)}</td>
                <td className="r num" style={{ color: o.totalImpact < wait.totalImpact ? '#15803d' : undefined }}>
                  {o === wait ? '—' : `${o.totalImpact < wait.totalImpact ? '−' : '+'}${usd(Math.abs(wait.totalImpact - o.totalImpact))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-b small" style={{ borderTop: '1px solid var(--line-2)' }}>
          <b>Why:</b> {p.rationale}
        </div>
      </div>

      <div className="card" style={{ height: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-h">
          <h2>{p.status === 'pending' ? 'Proposed schedule' : 'Schedule'}</h2>
          <span className="muted small">Grey bars = the plan before the delay · glowing bars = added by the agent</span>
        </div>
        <LandedGantt
          loadUrl={p.status === 'pending' ? `/api/proposals/${p.id}/project` : '/api/project/load'}
          showBaselines
          today={state.modes.today}
          blackFriday={state.blackFriday}
          promise={state.kpis.heroPromise}
        />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-h">
            <h2>Customer notice</h2>
            <span className="badge blue">FTC Mail Order Rule</span>
            <div className="spacer" />
            <span className="muted small">to {best.preordersLate} customers</span>
          </div>
          <div className="card-b stack">
            <div className="strong">{p.customerNotice.subject}</div>
            <div className="email">{sample}</div>
            {p.ftcChecks.map((c: any) => (
              <div key={c.name} className={`check ${c.ok ? 'ok' : 'no'}`}><i className={`fa ${c.ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} />{c.name}</div>
            ))}
            {p.goodwillCredit > 0 && <div className="small muted">Customers who wait get a {usd(p.goodwillCredit)} partial refund through PayPal as a thank-you.</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>How the agent got here</h2></div>
          <div className="card-b stack">
            <div className="agent-console" style={{ maxHeight: 260 }}>
              {p.agentTrace.map((t: any, i: number) => (
                <div className="ln" key={i}><span className="tool">›</span><span><span className="tool">{t.tool}</span> {t.summary}</span></div>
              ))}
            </div>
            <div className="small"><b>Reply to supplier:</b> {p.supplierMessage}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
