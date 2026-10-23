import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, usd } from '../lib/api';
import { useApp } from '../lib/store';
import { QcReportCard } from './Payments';
import { SAMPLE_DELAY } from '../components/DelayComposer';

const SETS = {
  good: ['qc-good-1.png', 'qc-good-2.png'],
  bad: ['qc-bad-1.png', 'qc-bad-2.png'],
};

export function SupplierPortal() {
  const { poId = 'PO-1042' } = useParams();
  const { state, agent } = useApp();
  const [files, setFiles] = useState<FileList | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [msg, setMsg] = useState(SAMPLE_DELAY);
  const [sent, setSent] = useState(0);
  const [err, setErr] = useState('');

  const po = state?.purchaseOrders.find((o: any) => o.id === poId);
  const supplier = state?.suppliers.find((s: any) => s.id === po?.supplierId);
  const balance = state?.payments.find((p: any) => p.poId === poId && p.type === 'balance');
  const agentEvents = agent.filter(e => e.ts >= sent);
  const ack = !!sent && !!agentEvents.find(e => e.kind === 'done' || e.kind === 'error');

  async function inspect() {
    setBusy(true);
    setErr('');
    setReport(null);
    try {
      const fd = new FormData();
      samples.forEach(s => fd.append('samples', s));
      if (files) Array.from(files).forEach(f => fd.append('photos', f));
      setReport(await api(`/api/supplier/${poId}/qc`, { method: 'POST', body: fd }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendUpdate() {
    setSent(Date.now() - 50);
    await api(`/api/supplier/${poId}/update`, { method: 'POST', json: { message: msg } });
  }

  return (
    <div className="standalone">
      <div className="standalone-top">
        <span className="logo-mark" style={{ width: 30, height: 30, borderRadius: 9, background: '#14532d', color: '#bbf7d0', display: 'grid', placeItems: 'center' }}><i className="fa fa-anchor" /></span>
        <div>
          <div className="strong">Landed supplier portal</div>
          <div className="muted small">{supplier?.name ?? '…'} · {poId} for {state?.merchant.name}</div>
        </div>
        <div style={{ flex: 1 }} />
        {balance && <span className={`badge ${balance.status === 'paid' ? 'green' : balance.status === 'held' ? 'amber' : 'blue'}`}>Balance {usd(balance.amount)} · {balance.status}</span>}
      </div>
      <div className="standalone-body grid" style={{ gap: 18 }}>
        <div className="card">
          <div className="card-h">
            <h2>Pre-shipment inspection photos</h2>
            <span className="muted small">Your {usd(balance?.amount ?? 0)} balance is paid to your PayPal account as soon as the batch passes.</span>
          </div>
          <div className="card-b stack">
            <div className="small strong">Try a sample photo set</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className={`btn sm ${samples.join() === SETS.good.join() ? 'primary' : ''}`} onClick={() => setSamples(SETS.good)}>Batch that matches spec</button>
              <button className={`btn sm ${samples.join() === SETS.bad.join() ? 'primary' : ''}`} onClick={() => setSamples(SETS.bad)}>Batch with defects</button>
              <span className="muted small">or upload your own:</span>
              <input type="file" accept="image/*" multiple onChange={e => setFiles(e.target.files)} />
            </div>
            {samples.length > 0 && (
              <div className="photos">{samples.map(s => <img key={s} src={`/samples/${s}`} alt={s} />)}</div>
            )}
            <div className="row">
              <button className="btn primary" disabled={busy || (!samples.length && !files?.length)} onClick={inspect}>
                {busy ? <i className="fa fa-circle-notch fa-spin" /> : <i className="fa fa-magnifying-glass" />} Submit for inspection
              </button>
              {busy && <span className="muted small">Comparing against the golden sample and the PO spec…</span>}
              {err && <span className="badge red">{err}</span>}
            </div>
          </div>
          {report && <QcReportCard r={report} />}
        </div>

        <div className="card">
          <div className="card-h"><h2>Send a production update</h2><span className="muted small">Kiln & Co's planning agent reads every update</span></div>
          <div className="card-b stack">
            <textarea className="input" value={msg} onChange={e => setMsg(e.target.value)} rows={4} />
            <div className="row">
              <button className="btn primary" onClick={sendUpdate} disabled={!!sent && !ack}><i className="fa fa-paper-plane" /> Send update</button>
              {!!sent && !ack && <span className="muted small"><i className="fa fa-circle-notch fa-spin" /> Delivered — Kiln & Co's agent is re-planning…</span>}
              {ack && <span className="badge green">Kiln & Co has been notified and will reply shortly.</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
