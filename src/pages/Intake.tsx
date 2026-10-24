import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, usd } from '../lib/api';
import { toast } from '../components/Toast';
import { Icon } from '../components/Icon';

export function Intake() {
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState<'read' | 'commit' | null>(null);
  const [err, setErr] = useState('');

  async function read(sample?: boolean) {
    setBusy('read');
    setErr('');
    setDraft(null);
    try {
      const fd = new FormData();
      if (sample) fd.append('sample', 'PO-1045.pdf');
      else if (file) fd.append('file', file);
      if (text.trim()) fd.append('text', text);
      setDraft(await api('/api/intake/read', { method: 'POST', body: fd }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy('commit');
    try {
      const r = await api('/api/intake/commit', { method: 'POST', json: draft });
      toast(`${r.poId} added to the timeline`);
      nav('/timeline');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const po = draft?.po;
  return (
    <div className="grid cols-main" style={{ alignItems: 'start' }}>
      <div className="grid" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-h"><h2>1 · Drop a purchase order</h2></div>
          <div className="card-b stack">
            <input className="input" type="file" accept="application/pdf,.txt" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <label className="f">…or paste the PO text<textarea className="input" value={text} onChange={e => setText(e.target.value)} placeholder="PO number, supplier, quantity, unit cost, payment terms, lead time, incoterm…" /></label>
            <div className="row">
              <button className="btn primary" disabled={!!busy || (!file && !text.trim())} onClick={() => read(false)}>
                {busy === 'read' ? <Icon name="spinner" spin /> : <Icon name="sparkles" />} Read & plan
              </button>
              <button className="btn" disabled={!!busy} onClick={() => read(true)}><Icon name="file" /> Use sample PO-1045.pdf</button>
              <a className="btn ghost sm" href="/samples/PO-1045.pdf" target="_blank" rel="noreferrer">view sample</a>
            </div>
            {err && <div className="badge red">{err}</div>}
          </div>
        </div>

        {draft && (
          <div className="card">
            <div className="card-h">
              <h2>2 · Drafted plan</h2>
              {draft.source === 'demo' && <span className="badge amber">Demo AI</span>}
              <div className="spacer" />
              <button className="btn primary" onClick={commit} disabled={!!busy}>
                {busy === 'commit' ? <Icon name="spinner" spin /> : <Icon name="plus" />} Add to timeline
              </button>
            </div>
            <table className="t">
              <thead><tr><th>Task</th><th className="r">Days</th><th>After</th><th>Why</th></tr></thead>
              <tbody>
                {draft.plan.tasks.map((t: any) => (
                  <tr key={t.key}>
                    <td className="strong">{t.kind === 'payment' && <span className="badge blue" style={{ marginRight: 6 }}>PayPal</span>}{t.name}</td>
                    <td className="r num">{t.durationDays}</td>
                    <td className="muted small">{t.dependsOn.join(', ') || 'start'}</td>
                    <td className="small">{t.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-b small muted">Assumptions: {draft.plan.assumptions.join(' · ')}</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h"><h2>What the agent extracted</h2></div>
        {!po ? (
          <div className="empty">Terms, payment schedule and QC checks will appear here. Payment milestones become PayPal Payouts that release only when their condition is met.</div>
        ) : (
          <div className="card-b stack small">
            <div className="strong" style={{ fontSize: 15 }}>{po.poNumber} · {po.productName}</div>
            <div>{po.supplierName} ({po.supplierCountry}) · {po.supplierContact}</div>
            <div>{po.quantity.toLocaleString()} × {usd(po.unitCost, 2)} = <b>{usd(po.quantity * po.unitCost)}</b></div>
            <div>{po.depositPct}% deposit · {po.balanceTerms}</div>
            <div>{po.incoterm} · {po.originPort} → {po.destinationPort} · {po.shipMode}</div>
            <div className="divider" />
            <b>Spec</b>
            {po.spec.map((s: any) => <div key={s.key}>{s.key}: <span className="muted">{s.value}</span></div>)}
            <b>QC checks</b>
            {po.qcRequirements.map((q: string) => <div key={q} className="check ok"><Icon name="camera" />{q}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
