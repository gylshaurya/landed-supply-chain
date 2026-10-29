import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtDate, usd } from '../lib/api';
import { useApp } from '../lib/store';
import { QcReportCard } from './Payments';
import { SAMPLE_DELAY } from '../components/DelayComposer';
import { Icon } from '../components/Icon';

const SETS = {
  good: ['qc-good-1.jpg', 'qc-good-2.png'],
  bad: ['qc-bad-1.jpg', 'qc-bad-2.png'],
};

interface Photo {
  key: string;
  name: string;
  src: string;
  file?: File; // uploaded by the supplier
  sample?: string; // one of the bundled demo photos
}

export function SupplierPortal() {
  const { poId = 'PO-1042' } = useParams();
  const { state, agent } = useApp();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [msg, setMsg] = useState(SAMPLE_DELAY);
  const [sent, setSent] = useState(0);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Free preview URLs for uploaded files when they are removed or the page closes.
  const urls = useRef(new Set<string>());
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);

  const po = state?.purchaseOrders.find((o: any) => o.id === poId);
  const supplier = state?.suppliers.find((s: any) => s.id === po?.supplierId);
  const product = state?.products.find((p: any) => p.id === po?.productId);
  const balance = state?.payments.find((p: any) => p.poId === poId && p.type === 'balance');
  const paidSoFar = (state?.payments ?? []).filter((p: any) => p.poId === poId && p.status === 'paid').reduce((s: number, p: any) => s + p.amount, 0);
  const agentEvents = agent.filter(e => e.ts >= sent);
  const ack = !!sent && !!agentEvents.find(e => e.kind === 'done' || e.kind === 'error');

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next = Array.from(list)
      .filter(f => f.type.startsWith('image/'))
      .map(f => {
        const src = URL.createObjectURL(f);
        urls.current.add(src);
        return { key: `${f.name}-${f.size}-${f.lastModified}`, name: f.name, src, file: f };
      });
    setPhotos(cur => [...cur.filter(p => !p.sample), ...next.filter(n => !cur.some(c => c.key === n.key))].slice(0, 6));
    setReport(null);
  }

  function pickSet(set: string[]) {
    setPhotos(set.map(s => ({ key: s, name: s, src: `/samples/${s}`, sample: s })));
    setReport(null);
  }

  function remove(key: string) {
    setPhotos(cur => {
      const gone = cur.find(p => p.key === key);
      if (gone?.file) {
        URL.revokeObjectURL(gone.src);
        urls.current.delete(gone.src);
      }
      return cur.filter(p => p.key !== key);
    });
  }

  async function inspect() {
    setBusy(true);
    setErr('');
    setReport(null);
    try {
      const fd = new FormData();
      for (const p of photos) {
        if (p.sample) fd.append('samples', p.sample);
        if (p.file) fd.append('photos', p.file);
      }
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

  const isSet = (set: string[]) => photos.length === set.length && photos.every((p, i) => p.sample === set[i]);
  const payTone = balance?.status === 'paid' ? 'paid' : balance?.status === 'held' ? 'held' : 'waiting';

  return (
    <div className="portal">
      <header className="portal-top">
        <div className="logo" style={{ padding: 0 }}>
          <b>Landed</b>
          <span className="logo-mark" />
        </div>
        <span className="portal-tag">Supplier portal</span>
        <div className="tl-spacer" />
        <span className="chip"><span className="dot" style={{ color: 'var(--lime)' }} />{poId} · {product?.name ?? '…'}</span>
        <div className="user-chip">
          <span className="avatar" style={{ background: 'var(--apricot)' }}>{(supplier?.name ?? '··').split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
          <div className="who">
            {supplier?.name ?? '…'}
            <span>{supplier?.contact} · {supplier?.country}</span>
          </div>
        </div>
      </header>

      <div className="portal-body">
        <div className="portal-main">
          <section className="card">
            <div className="card-h" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2>Pre-shipment inspection</h2>
                <div className="card-sub">Upload photos of the finished batch. The balance is paid to your PayPal account as soon as it passes.</div>
              </div>
            </div>
            <div className="card-b stack" style={{ gap: 16 }}>
              <div
                className={`dropzone ${drag ? 'over' : ''}`}
                onDragOver={e => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDrag(false);
                  addFiles(e.dataTransfer.files);
                }}
                onClick={() => input.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
              >
                <span className="dz-icon"><Icon name="camera" size={22} /></span>
                <div>
                  <div className="strong">Drop batch photos here, or <u>browse</u></div>
                  <div className="muted small">Product close-ups and the carton label · up to 6 images</div>
                </div>
                <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
              </div>

              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span className="muted small">Or try a sample batch:</span>
                <button className={`btn sm ${isSet(SETS.good) ? 'primary' : ''}`} onClick={() => pickSet(SETS.good)}>Matches spec</button>
                <button className={`btn sm ${isSet(SETS.bad) ? 'primary' : ''}`} onClick={() => pickSet(SETS.bad)}>Has defects</button>
              </div>

              {photos.length > 0 && (
                <div className="previews">
                  {photos.map(p => (
                    <figure key={p.key} className="preview">
                      <img src={p.src} alt={p.name} />
                      <figcaption>{p.name}</figcaption>
                      <button className="preview-x" onClick={() => remove(p.key)} aria-label={`Remove ${p.name}`}><Icon name="circle-x" size={18} /></button>
                    </figure>
                  ))}
                </div>
              )}

              <div className="row">
                <button className="btn primary lg" disabled={busy || !photos.length} onClick={inspect}>
                  {busy ? <Icon name="spinner" spin /> : <Icon name="search" />} {photos.length ? `Submit ${photos.length} photo${photos.length > 1 ? 's' : ''} for inspection` : 'Submit for inspection'}
                </button>
                {busy && <span className="muted small">Comparing against the approved sample and the order spec…</span>}
                {err && <span className="badge red">{err}</span>}
              </div>
            </div>
            {report && <QcReportCard r={report} />}
          </section>

          <section className="card">
            <div className="card-h" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2>Production update</h2>
                <div className="card-sub">Running late, or need something? {state?.merchant.name}'s planning agent reads every message.</div>
              </div>
            </div>
            <div className="card-b stack">
              <textarea className="input" value={msg} onChange={e => setMsg(e.target.value)} rows={4} />
              <div className="row">
                <button className="btn primary" onClick={sendUpdate} disabled={!!sent && !ack}><Icon name="send" size={16} /> Send update</button>
                {!!sent && !ack && <span className="muted small"><Icon name="spinner" spin size={15} /> Delivered. {state?.merchant.name} is re-planning…</span>}
                {ack && <span className="badge green">{state?.merchant.name} has been notified and will reply shortly.</span>}
              </div>
            </div>
          </section>
        </div>

        <aside className="portal-side">
          <div className={`paycard portal-pay ${payTone}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small">Balance payment</span>
              <span className="brand">PayPal</span>
            </div>
            <div className="fig num">{usd(balance?.amount ?? 0)}</div>
            <div className="row tiny" style={{ justifyContent: 'space-between' }}>
              <span>{balance?.status === 'paid' ? `Paid ${balance.paidAt ? fmtDate(balance.paidAt) : ''}` : balance?.status === 'held' ? 'Held until the batch passes' : 'Released when QC passes'}</span>
              <span>{supplier?.paypalEmail ? 'to your PayPal' : ''}</span>
            </div>
          </div>

          <section className="card">
            <div className="card-h"><h2>Order</h2></div>
            <div className="card-b stack" style={{ gap: 14 }}>
              <div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small strong">{po?.quantity?.toLocaleString()} × {product?.name}</span>
                  <span className="muted small">{po?.progress ?? 0}%</span>
                </div>
                <div className="hbar thin" style={{ marginTop: 8 }}><span className="fill-lime" style={{ width: `${Math.max(po?.progress ?? 0, 3)}%` }} /></div>
              </div>
              <div className="kv"><span>Route</span><b>{po?.originPort} → {po?.destinationPort}</b></div>
              <div className="kv"><span>Terms</span><b>{po?.incoterm}</b></div>
              <div className="kv"><span>Paid so far</span><b>{usd(paidSoFar)}</b></div>
              <div className="kv"><span>Ships to customers</span><b>{fmtDate(po?.keyDates?.airLaunch ?? po?.keyDates?.launch)}</b></div>
            </div>
          </section>

          <section className="card">
            <div className="card-h"><h2>What the inspector checks</h2></div>
            <div className="card-b stack" style={{ gap: 10 }}>
              {(po?.qcRequirements ?? []).map((q: string) => (
                <div key={q} className="check ok"><Icon name="circle-check" size={16} /><span>{q}</span></div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
