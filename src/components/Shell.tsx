import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../lib/store';
import { api, fmtDate } from '../lib/api';

const TITLES: Record<string, [string, string]> = {
  '/': ['Command center', 'Every shipment, payment and customer promise in one place'],
  '/timeline': ['Supply timeline', 'Bryntum Gantt · drag a bar and everything downstream re-plans'],
  '/runway': ['Stock runway', 'When each product sells out and when stock lands'],
  '/preorders': ['Pre-orders', 'Customer promises backed by PayPal captures'],
  '/payments': ['Supplier payments & QC', 'PayPal Payouts released only when goods pass inspection'],
  '/intake': ['New purchase order', 'Drop a PO and the planner builds the timeline'],
  '/outbox': ['Outbox', 'Every message the agents sent on your behalf'],
};

export function Shell() {
  const { state } = useApp();
  const loc = useLocation();
  const pending = state?.proposals?.filter((p: any) => p.status === 'pending') ?? [];
  const [title, sub] = TITLES[loc.pathname] ?? (loc.pathname.startsWith('/proposals') ? ['Recovery plan', 'Review what the agent wants to do, then approve in one click'] : ['Landed', '']);
  const full = loc.pathname === '/timeline' || loc.pathname === '/runway' || loc.pathname === '/preorders';
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="logo">
          <span className="logo-mark"><i className="fa fa-anchor" /></span>
          <b>Landed</b>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end><i className="fa fa-gauge-high" />Command center{pending.length > 0 && <span className="count">{pending.length}</span>}</NavLink>
          <NavLink to="/timeline"><i className="fa fa-bars-staggered" />Supply timeline</NavLink>
          <NavLink to="/runway"><i className="fa fa-boxes-stacked" />Stock runway</NavLink>
          <NavLink to="/preorders"><i className="fa fa-receipt" />Pre-orders</NavLink>
          <NavLink to="/payments"><i className="fa fa-money-check-dollar" />Payments & QC</NavLink>
          <NavLink to="/outbox"><i className="fa fa-paper-plane" />Outbox</NavLink>
          <NavLink to="/intake"><i className="fa fa-file-circle-plus" />New PO</NavLink>
          <div className="nav-label">Other sides of the story</div>
          <a href="/portal/PO-1042" target="_blank" rel="noreferrer"><i className="fa fa-industry" />Supplier portal</a>
          <a href="/store" target="_blank" rel="noreferrer"><i className="fa fa-store" />Storefront</a>
        </nav>
        <div className="sidebar-foot">
          <div><strong style={{ color: '#fff' }}>{state?.merchant?.name ?? '…'}</strong></div>
          <div>Today · {fmtDate(state?.modes?.today, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          <div>{state ? `${state.daysToBlackFriday} days to Black Friday` : ''}</div>
          <button
            className="btn sm ghost"
            style={{ color: '#8fae98', justifyContent: 'flex-start', padding: 0 }}
            onClick={async () => {
              if (!window.confirm('Reset the demo data to the starting story?')) return;
              await api('/api/admin/reset', { method: 'POST' });
              window.location.href = '/';
            }}
          >
            <i className="fa fa-rotate-left" /> Reset demo
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
    <div className="row">
      <span className={`badge ${modes.ai === 'live' ? 'violet' : 'amber'}`} title={modes.ai === 'live' ? `Agents run on ${modes.model}` : 'No ANTHROPIC_API_KEY: agents use recorded demo responses'}>
        <i className="fa fa-wand-magic-sparkles" /> {modes.ai === 'live' ? `Claude · ${modes.model}` : 'Demo AI'}
      </span>
      <span className={`badge ${modes.paypal === 'sandbox' ? 'blue' : 'amber'}`} title={modes.paypal === 'sandbox' ? 'Live calls to the PayPal sandbox' : 'No PayPal credentials: calls are simulated'}>
        <i className="fa fa-circle-dollar-to-slot" /> {modes.paypal === 'sandbox' ? 'PayPal sandbox' : 'PayPal simulated'}
      </span>
    </div>
  );
}
