import { useState } from 'react';
import { useApp } from '../lib/store';
import { api, ago, fmtDate, usd } from '../lib/api';
import { toast } from '../components/Toast';
import { Icon } from '../components/Icon';

const PAY: Record<string, string> = { paid: 'green', scheduled: 'blue', processing: 'blue', held: 'amber', failed: 'red' };
const GATE: Record<string, string> = { qc_pass: 'Released when AI QC passes', goods_received: 'Released when goods arrive', none: 'Released on approval' };

export function Payments() {
  const { state } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  if (!state) return <div className="empty">Loading…</div>;

  async function release(id: string) {
    setBusy(id);
    try {
      const r = await api(`/api/payments/${id}/release`, { method: 'POST' });
      toast(r.status === 'paid' ? `Paid ${usd(r.amount)} · PayPal batch ${r.payoutBatchId}` : `Payout ${r.status}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="card">
        <div className="card-h">
          <h2>Supplier payments</h2>
          <span className="badge blue">PayPal Payouts</span>
          <div className="spacer" />
          <span className="muted small">Money only moves when the condition on the right is met.</span>
        </div>
        <table className="t">
          <thead>
            <tr><th>PO</th><th>Supplier</th><th>Payment</th><th className="r">Amount</th><th>Condition</th><th>Status</th><th>PayPal reference</th><th /></tr>
          </thead>
          <tbody>
            {state.payments.map((p: any) => {
              const po = state.purchaseOrders.find((o: any) => o.id === p.poId);
              const sup = state.suppliers.find((s: any) => s.id === po?.supplierId);
              return (
                <tr key={p.id}>
                  <td className="strong" style={{ whiteSpace: 'nowrap' }}>{p.poId}</td>
                  <td>{sup?.name}<div className="muted tiny trunc" title={sup?.paypalEmail}>{sup?.paypalEmail}</div></td>
                  <td>{p.label}</td>
                  <td className="r num strong">{usd(p.amount)}</td>
                  <td className="small">{GATE[p.gate ?? 'none']}</td>
                  <td>
                    <span className={`badge cap ${PAY[p.status]}`}>{p.status}</span>
                    {p.holdReason && <div className="tiny muted" style={{ maxWidth: 260, marginTop: 4 }}>{p.holdReason}</div>}
                  </td>
                  <td className="mono tiny">{p.payoutBatchId ?? (p.paidAt ? `paid ${fmtDate(p.paidAt)} (history)` : '—')}{p.simulated && p.payoutBatchId ? ' · simulated' : ''}</td>
                  <td className="r">
                    {p.status !== 'paid' && p.status !== 'processing' && (
                      <button className="btn sm" disabled={busy === p.id} onClick={() => release(p.id)}>
                        {busy === p.id ? <Icon name="spinner" spin /> : <Icon name="dollar" />} Release
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>AI quality inspections</h2>
          <div className="spacer" />
          <a className="btn sm" href="/portal/PO-1042" target="_blank" rel="noreferrer"><Icon name="factory" /> Open supplier portal to upload photos</a>
        </div>
        {state.qcReports.length === 0 && <div className="empty">No inspections yet. The factory uploads photos from the supplier portal; the balance payment is released only if the batch passes.</div>}
        {state.qcReports.map((r: any) => <QcReportCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}

export function QcReportCard({ r }: { r: any }) {
  const tone = r.verdict === 'pass' ? 'green' : r.verdict === 'fail' ? 'red' : 'amber';
  return (
    <div className="card-b" style={{ borderBottom: '1px solid var(--line-2)' }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className={`badge ${tone}`}>{r.verdict === 'pass' ? 'Passed' : r.verdict === 'fail' ? 'Failed' : 'Needs review'}</span>
        <span className="strong">{r.poId}</span>
        <span className="muted small">{Math.round(r.confidence * 100)}% confidence · est. defect rate {r.estimatedDefectRatePct}% · {ago(r.createdAt)}</span>
        <div style={{ flex: 1 }} />
        <span className={`badge ${r.decision === 'released' ? 'blue' : 'amber'}`}>{r.decision === 'released' ? 'Balance released via PayPal' : r.decision === 'held' ? 'Balance held' : 'Waiting for review'}</span>
        {r.source === 'demo' && <span className="badge amber">Demo AI</span>}
      </div>
      <div className="grid cols-2">
        <div className="photos">{r.photos.map((p: string) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="inspection" /></a>)}</div>
        <div className="stack">
          <p>{r.summary}</p>
          {r.checks.map((c: any) => (
            <div key={c.name} className={`check ${c.result === 'pass' ? 'ok' : 'no'}`}>
              <Icon name={c.result === 'pass' ? 'circle-check' : c.result === 'fail' ? 'circle-x' : 'help'} size={16} />
              <span><b>{c.name}</b> — <span className="muted">{c.note}</span></span>
            </div>
          ))}
          {r.defects.length > 0 && (
            <div className="small">
              <b>Defects:</b> {r.defects.map((d: any) => `${d.type} (${d.severity}, photo ${d.photoIndex + 1})`).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
