import { Link } from 'react-router-dom';
import { ago } from '../lib/api';

const ICON: Record<string, string> = { agent: 'fa-wand-magic-sparkles', paypal: 'fa-circle-dollar-to-slot', supplier: 'fa-industry', customer: 'fa-user', merchant: 'fa-user-check', system: 'fa-box' };

export function Feed({ items, limit = 12 }: { items: any[]; limit?: number }) {
  if (!items?.length) return <div className="empty">Nothing yet.</div>;
  return (
    <div className="feed">
      {items.slice(0, limit).map(a => (
        <div className="feed-item" key={a.id}>
          <div className={`feed-icon ${a.actor}`}><i className={`fa ${ICON[a.actor] ?? 'fa-circle'}`} /></div>
          <div>
            <div className="feed-title">{a.link ? <Link to={a.link} style={{ textDecoration: 'none' }}>{a.title}</Link> : a.title}</div>
            {a.detail && <div className="feed-detail">{a.detail}</div>}
            <div className="feed-time">{ago(a.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
