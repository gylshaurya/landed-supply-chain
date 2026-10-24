import { Link } from 'react-router-dom';
import { ago } from '../lib/api';
import { Icon } from './Icon';

const ICON: Record<string, string> = { agent: 'sparkles', paypal: 'dollar', supplier: 'factory', customer: 'heart', merchant: 'check', system: 'boxes' };
const WHO: Record<string, string> = { agent: 'Agent', paypal: 'PayPal', supplier: 'Supplier', customer: 'Customer', merchant: 'You', system: 'Landed' };

export function Feed({ items, limit = 12 }: { items: any[]; limit?: number }) {
  if (!items?.length) return <div className="empty">Nothing yet. Supplier updates, PayPal payments and customer replies show up here.</div>;
  return (
    <div className="feed">
      {items.slice(0, limit).map(a => (
        <div className="feed-item" key={a.id}>
          <div className={`feed-icon ${a.actor}`}><Icon name={ICON[a.actor] ?? 'more'} size={18} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="feed-title">{a.link ? <Link to={a.link}>{a.title}</Link> : a.title}</div>
            {a.detail && <div className="feed-detail">{a.detail}</div>}
          </div>
          <div className="feed-side">
            <span className="feed-time">{ago(a.ts)}</span>
            <span className={`feed-who ${a.actor}`}>{WHO[a.actor] ?? a.actor}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
