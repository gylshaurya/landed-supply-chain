import { useEffect, useState } from 'react';
import { api, ago } from '../lib/api';
import { useApp } from '../lib/store';

export function Outbox() {
  const { version } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  useEffect(() => {
    void api<any[]>('/api/outbox').then(d => {
      setItems(d);
      setSel((s: any) => s ?? d[0] ?? null);
    });
  }, [version]);
  if (!items.length) return <div className="card empty">No messages yet. Notices to customers and replies to suppliers show up here.</div>;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(280px, 380px) 1fr', alignItems: 'start' }}>
      <div className="card" style={{ maxHeight: 'calc(100vh - 140px)', overflow: 'auto' }}>
        {items.map(m => (
          <div key={m.id} onClick={() => setSel(m)} className="feed-item" style={{ cursor: 'pointer', background: sel?.id === m.id ? 'var(--panel-2)' : undefined, gridTemplateColumns: '1fr' }}>
            <div className="row"><span className={`badge ${m.kind === 'customer_notice' ? 'blue' : 'amber'}`}>{m.kind === 'customer_notice' ? 'Customer' : 'Supplier'}</span><span className="small strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.to}</span></div>
            <div className="small">{m.subject}</div>
            <div className="feed-time">{ago(m.ts)}</div>
          </div>
        ))}
      </div>
      {sel && (
        <div className="card">
          <div className="card-h">
            <div><div className="strong">{sel.subject}</div><div className="muted small">to {sel.to}</div></div>
            <div className="spacer" />
            {sel.link && <a className="btn sm" href={sel.link} target="_blank" rel="noreferrer">Open customer page</a>}
          </div>
          <div className="card-b"><div className="email">{sel.body}</div></div>
        </div>
      )}
    </div>
  );
}
