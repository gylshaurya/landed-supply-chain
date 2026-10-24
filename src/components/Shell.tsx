import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../lib/store';
import { api, fmtDate } from '../lib/api';
import { Icon } from './Icon';

const TITLES: Record<string, [string, string]> = {
  '/': ['Command center', 'Every shipment, payment and customer promise in one place'],
  '/timeline': ['Supply timeline', 'Drag a bar and everything downstream re-plans'],
  '/runway': ['Stock runway', 'When each product sells out and when stock lands'],
  '/preorders': ['Pre-orders', 'Customer promises backed by PayPal captures'],
  '/payments': ['Payments & QC', 'PayPal Payouts released only when goods pass inspection'],
  '/intake': ['New purchase order', 'Drop a PO and the planner builds the timeline'],
  '/outbox': ['Outbox', 'Every message the agents sent on your behalf'],
};

export function Shell() {
  const { state } = useApp();
  const loc = useLocation();
  const pending = state?.proposals?.filter((p: any) => p.status === 'pending') ?? [];
  const [title, sub] = TITLES[loc.pathname] ?? (loc.pathname.startsWith('/proposals') ? ['Recovery plan', 'Review what the agent wants to do, then approve in one click'] : ['Landed', '']);
  const full = loc.pathname === '/timeline' || loc.pathname === '/runway' || loc.pathname === '/preorders';
  const merchant = state?.merchant?.name ?? '…';
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="logo" aria-label="Landed home">
          <b>Landed</b>
          <span className="logo-mark" />
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end><Icon name="grid" size={20} />Command center{pending.length > 0 && <span className="count">{pending.length}</span>}</NavLink>
          <NavLink to="/timeline"><Icon name="timeline" size={20} />Supply timeline</NavLink>
          <NavLink to="/runway"><Icon name="boxes" size={20} />Stock runway</NavLink>
          <NavLink to="/preorders"><Icon name="receipt" size={20} />Pre-orders</NavLink>
          <NavLink to="/payments"><Icon name="wallet" size={20} />Payments & QC</NavLink>
          <NavLink to="/outbox"><Icon name="send" size={20} />Outbox</NavLink>
          <NavLink to="/intake"><Icon name="file-plus" size={20} />New PO</NavLink>
          <div className="nav-label">Other sides of the story</div>
          <a href="/portal/PO-1042" target="_blank" rel="noreferrer"><Icon name="factory" size={20} />Supplier portal</a>
          <a href="/store" target="_blank" rel="noreferrer"><Icon name="store" size={20} />Storefront</a>
        </nav>
        <div className="sidebar-card">
          <span className="clock"><Icon name="anchor" size={17} /></span>
          <h3>{state ? `${state.daysToBlackFriday} days to Black Friday` : '…'}</h3>
          <p>Demo clock is frozen on {fmtDate(state?.modes?.today, { weekday: 'short', month: 'short', day: 'numeric' })} so the story replays the same way.</p>
          <button
            className="btn primary block"
            onClick={async () => {
              if (!window.confirm('Reset the demo data to the starting story?')) return;
              await api('/api/admin/reset', { method: 'POST' });
              window.location.href = '/';
            }}
          >
            <Icon name="reset" size={16} /> Reset demo
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="title">
            <h1>{title}</h1>
            <div className="sub">{sub}</div>
          </div>
          <div className="spacer" />
          {state && <ModeBadges modes={state.modes} />}
          <div className="user-chip">
            <span className="avatar" style={{ background: 'var(--lime)' }}>{merchant.slice(0, 1)}</span>
            <div className="who">
              {merchant}
              <span>{state?.merchant?.email ?? ''}</span>
            </div>
          </div>
          <NavLink to="/intake" className="btn lg" style={{ height: 44, borderColor: 'transparent' }}>
            <Icon name="plus" size={18} /> New PO
          </NavLink>
        </header>
        <div className={`page ${full ? 'full' : ''}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function ModeBadges({ modes }: { modes: any }) {
  return (
    <>
      <span className="chip" title={modes.ai === 'live' ? `Agents run on ${modes.model}` : 'No AI key: agents use recorded demo responses'}>
        <span className="dot" style={{ color: modes.ai === 'live' ? 'var(--lime)' : 'var(--apricot)' }} />
        <span>{modes.ai === 'live' ? <>{modes.provider === 'gemini' ? 'Gemini' : 'Claude'}<span className="long"> · {modes.model}</span></> : 'Demo AI'}</span>
      </span>
      <span className="chip" title={modes.paypal === 'sandbox' ? 'Live calls to the PayPal sandbox' : 'No PayPal credentials: calls are simulated'}>
        <span className="dot" style={{ color: modes.paypal === 'sandbox' ? 'var(--paypal)' : 'var(--apricot)' }} />
        <span>PayPal<span className="long">{modes.paypal === 'sandbox' ? ' sandbox' : ' simulated'}</span></span>
      </span>
    </>
  );
}
