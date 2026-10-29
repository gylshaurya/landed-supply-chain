import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/store';
import { api, daysBetween, fmtDate, usd } from '../lib/api';
import { Feed } from '../components/Feed';
import { RecoverButton } from '../components/DelayComposer';
import { Icon } from '../components/Icon';

const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

export function CommandCenter() {
  const { state } = useApp();
  if (!state) return <div className="empty">Loading…</div>;
  return (
    <div className="cc">
      <div className="cc-left">
        <SalesCard />
        <div className="split">
          <ReadinessCard />
          <AgentCard />
        </div>
        <div className="tri">
          <MoneyCard />
          <PromiseCard />
          <ShipmentsCard />
        </div>
      </div>
      <div className="cc-right">
        <PayPalPanel />
        <div className="card">
          <div className="card-h">
            <h2>Activity</h2>
            <div className="spacer" />
            <Link to="/outbox" className="btn sm">Outbox · {state.outboxCount}</Link>
          </div>
          <Feed items={state.activity} limit={8} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ sales chart */

interface Week { weekStart: string; sold: number; preordered: number; lost: number; arrivals: number }

function SalesCard() {
  const { state, version } = useApp();
  const [productId, setProductId] = useState('pour-over');
  const [data, setData] = useState<{ weeks: Week[]; totals: { sold: number; preordered: number; lost: number } } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [colsWidth, setColsWidth] = useState(600);
  useEffect(() => {
    void api(`/api/forecast/${productId}`).then(setData);
  }, [productId, version]);
  useEffect(() => {
    const el = colsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setColsWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = state.kpis;

  const { max, min, ticks } = useMemo(() => {
    const weeks = data?.weeks ?? [];
    const top = Math.max(1, ...weeks.map(w => w.sold + w.preordered));
    const bottom = Math.max(0, ...weeks.map(w => w.lost));
    const step = niceStep((top + bottom) / 4);
    const max = Math.ceil(top / step) * step;
    const min = Math.ceil(bottom / step) * step;
    const ticks: number[] = [];
    for (let v = max; v >= -min; v -= step) ticks.push(v);
    return { max, min, ticks };
  }, [data]);

  // Show as many week labels as fit (~64px each); the Black Friday week always keeps its label.
  const weeks = data?.weeks ?? [];
  const bfIndex = weeks.findIndex(w => w.weekStart <= state.blackFriday && state.blackFriday < addDaysISO(w.weekStart, 7));
  const every = Math.max(1, Math.ceil(64 / Math.max(1, colsWidth / Math.max(1, weeks.length))));
  const showLabel = (i: number) => i === bfIndex || (i % every === 0 && Math.abs(i - bfIndex) >= every);

  const H = 230;
  const posH = (H * max) / (max + min || 1);
  const negH = H - posH;
  const total = data ? data.totals.sold + data.totals.preordered : 0;

  return (
    <div className="card hero">
      <div className="hero-main">
        <div className="hero-head">
          <div>
            <div className="hero-figure">{data ? usd(total) : '…'}</div>
            <div className="card-sub" style={{ marginTop: 6 }}>Projected sales to Dec 31 under the current plan</div>
          </div>
          <select className="select-pill" value={productId} onChange={e => setProductId(e.target.value)} aria-label="Product">
            {state.products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="legend" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <span><i className="sw straw" />Pre-ordered</span>
          <span><i className="sw lime" />Sold</span>
          <span><i className="sw apricot" />Lost (sold out)</span>
        </div>
        <div className="chart" style={{ height: H + 24 }} onMouseLeave={() => setHover(null)}>
          <div className="chart-grid" style={{ inset: `0 0 24px 34px` }}>
            {ticks.map(t => (
              <div key={t}><span>{t === 0 ? '0' : `${t < 0 ? '−' : ''}${Math.abs(t) >= 1000 ? `${Math.round(Math.abs(t) / 1000)}k` : Math.abs(t)}`}</span></div>
            ))}
          </div>
          <div className="chart-zero" style={{ top: posH }} />
          <div className="chart-cols" ref={colsRef}>
            {(data?.weeks ?? []).map((w, i) => {
              const isBF = w.weekStart <= state.blackFriday && state.blackFriday < addDaysISO(w.weekStart, 7);
              const s = (v: number) => `${(v / (max || 1)) * posH}px`;
              const n = (v: number) => `${(v / (min || 1)) * negH}px`;
              const empty = w.sold + w.preordered === 0;
              const today = state.modes.today as string;
              const hasToday = w.weekStart <= today && today < addDaysISO(w.weekStart, 7);
              // Position inside the week column: Monday = left edge, Sunday = right edge.
              const todayAt = hasToday ? ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7 + 0.5) / 7 : 0;
              return (
                <div key={w.weekStart} className={`chart-col ${isBF ? 'bf' : ''} ${hover === i ? 'on' : ''} ${showLabel(i) ? '' : 'skip'}`} style={{ ['--pos' as string]: `${posH}px`, ['--neg' as string]: `${negH}px` }} onMouseEnter={() => setHover(i)}>
                  {hasToday && (
                    <div className="today-mark" style={{ left: `${todayAt * 100}%` }} aria-label={`Today, ${fmtDate(today)}`}>
                      <span>Today</span>
                    </div>
                  )}
                  <div className="pos">
                    {empty ? <div className="seg ghost" style={{ height: 14 }} /> : null}
                    {w.preordered > 0 && <div className="seg fill-straw" style={{ height: s(w.preordered) }} />}
                    {w.sold > 0 && <div className="seg fill-lime" style={{ height: s(w.sold) }} />}
                  </div>
                  <div className="neg">{w.lost > 0 && <div className="seg fill-apricot" style={{ height: n(w.lost) }} />}</div>
                  <div className="lbl">{isBF ? 'BF wk' : fmtDate(w.weekStart)}</div>
                </div>
              );
            })}
          </div>
          {hover !== null && data?.weeks[hover] && (
            <div className="chart-tip" style={{ left: `calc(34px + ${(hover + 0.5) * (100 / data.weeks.length)}% - ${((hover + 0.5) * 34) / data.weeks.length}px)`, top: 40 }}>
              <div className="d">Week of {fmtDate(data.weeks[hover].weekStart, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
              <div className="r"><span><i className="sw straw" />Pre-ordered</span><b>{usd(data.weeks[hover].preordered)}</b></div>
              <div className="r"><span><i className="sw lime" />Sold</span><b>{usd(data.weeks[hover].sold)}</b></div>
              <div className="r"><span><i className="sw apricot" />Lost</span><b>{usd(data.weeks[hover].lost)}</b></div>
              {data.weeks[hover].arrivals > 0 && <div className="d" style={{ marginTop: 6, marginBottom: 0 }}>+{data.weeks[hover].arrivals} units land this week</div>}
            </div>
          )}
        </div>
      </div>
      <div className="hero-stats">
        <div className="stat">
          <div className="label">Pre-orders captured</div>
          <div className="value">{usd(k.preorderRevenue)}</div>
          <div className="foot"><Icon name="arrow-up" size={15} className="up" /><span className="up">{k.preorders}</span> open orders</div>
        </div>
        <div className="stat">
          <div className="label">Paid to suppliers</div>
          <div className="value">{usd(k.committedToSuppliers)}</div>
          <div className="foot"><Icon name="arrow-up" size={15} className="up" />PayPal Payouts</div>
        </div>
        <div className="stat">
          <div className="label">Lost while sold out</div>
          <div className="value">{data ? usd(data.totals.lost) : '…'}</div>
          <div className="foot"><Icon name="arrow-down" size={15} className="down" /><span className="down">forecast</span> to Dec 31</div>
        </div>
      </div>
    </div>
  );
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function addDaysISO(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ readiness */

function ReadinessCard() {
  const { state } = useApp();
  const r = state.kpis.bfReadiness;
  const share = pct(r.available, r.needed);
  return (
    <div className="card">
      <div className="card-h" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Black Friday readiness</h2>
          <div className="card-sub">Pour-over units free to sell Nov 27 → Nov 30</div>
        </div>
        <div className="spacer" />
        <span className={`badge ${share >= 100 ? 'green' : share > 0 ? 'amber' : 'red'}`}>{share >= 100 ? 'Covered' : share > 0 ? 'Short' : 'Not covered'}</span>
      </div>
      <div className="card-b">
        <div className="hbar" style={{ marginTop: 8 }}>
          <span className={share >= 100 ? 'fill-lime' : 'fill-apricot'} style={{ width: `${Math.max(share, 2)}%` }} />
        </div>
        <div className="row small" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <span className="num">{Math.min(r.available, 9999).toLocaleString()} units free</span>
          <span className="muted num">{r.needed.toLocaleString()} expected demand</span>
        </div>
        <div className="tiny muted" style={{ marginTop: 10 }}>{r.landed.toLocaleString()} units land before Black Friday · {r.committed.toLocaleString()} already promised to pre-orders</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ agent */

function AgentCard() {
  const { state } = useApp();
  const k = state.kpis;
  const pending = state.proposals.filter((p: any) => p.status === 'pending');
  const hero = state.purchaseOrders[0];
  const lateDays = daysBetween(k.heroLaunch, k.heroPromise);
  const blocks = ['straw', 'lime', 'apricot', 'lime', 'straw', 'lime', 'apricot', 'lime', 'lime'];
  return (
    <div className={`card ${pending.length ? 'hero-alert warn' : ''}`} style={{ position: 'relative', padding: pending.length ? undefined : 0 }}>
      {!pending.length && (
        <div className="blocks" aria-hidden>
          {blocks.map((c, i) => <i key={i} className={`fill-${c}`} style={{ opacity: i % 4 === 1 ? 0.35 : 1 }} />)}
        </div>
      )}
      {pending.length > 0 ? (
        <>
          <span className="badge amber" style={{ width: 'fit-content' }}><span className="dot" />Needs your decision · {pending[0].poId}</span>
          <h2 style={{ lineHeight: 1.3 }}>{pending[0].headline}</h2>
          <div className="row">
            <Link className="btn primary lg" to={`/proposals/${pending[0].id}`}><Icon name="clipboard" /> Review recovery plan</Link>
            <span className="muted small">Nothing changes until you approve.</span>
          </div>
        </>
      ) : k.heroAtRisk > 0 && !hero.keyDates?.airLaunch ? (
        <div className="card-b" style={{ paddingTop: 22, paddingRight: 120 }}>
          <h2>{k.heroAtRisk} pre-orders would miss their date</h2>
          <p className="muted small" style={{ margin: '6px 0 14px' }}>The current timeline ships PO-1042 on {fmtDate(hero.keyDates?.launch)}, after the {fmtDate(k.heroPromise)} promise.</p>
          <RecoverButton />
        </div>
      ) : (
        <div className="card-b" style={{ paddingTop: 22, paddingRight: 120 }}>
          <h2>{lateDays <= 0 ? 'Every promise is on track' : 'Recovery plan in motion'}</h2>
          <p className="muted small" style={{ margin: '6px 0 12px' }}>
            {hero.keyDates?.airLaunch
              ? `Air units ship pre-orders ${fmtDate(hero.keyDates.airLaunch)}; the rest of PO-1042 lands ${fmtDate(hero.keyDates.launch)}.`
              : `PO-1042 lands ${fmtDate(hero.keyDates?.launch)}. The recovery agent re-plans the moment a supplier reports a problem.`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ money */

function MoneyCard() {
  const { state } = useApp();
  const pays: any[] = state.payments;
  const total = pays.reduce((s, p) => s + p.amount, 0);
  const groups = [
    { key: 'paid', label: 'Paid', fill: 'lime', amount: pays.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0) },
    { key: 'scheduled', label: 'Scheduled', fill: 'straw', amount: pays.filter(p => p.status === 'scheduled' || p.status === 'processing').reduce((s, p) => s + p.amount, 0) },
    { key: 'held', label: 'Held by QC', fill: 'apricot', amount: pays.filter(p => p.status === 'held' || p.status === 'failed').reduce((s, p) => s + p.amount, 0) },
  ];
  return (
    <div className="card">
      <div className="card-h" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Supplier money</h2>
          <div className="card-sub">Every PayPal payout milestone</div>
        </div>
        <div className="spacer" />
        <Link to="/payments" className="btn icon" aria-label="Open payments"><Icon name="arrow-up" size={16} /></Link>
      </div>
      <div className="card-b">
        <div className="hero-figure" style={{ fontSize: 34, margin: '6px 0 16px' }}>{usd(total)}</div>
        <div className="hbar" style={{ height: 26 }}>
          {groups.filter(g => g.amount > 0).map(g => <span key={g.key} className={`fill-${g.fill}`} style={{ width: `${pct(g.amount, total)}%` }} />)}
        </div>
        <div className="legend-list">
          {groups.map(g => (
            <div key={g.key}><i className={`sw ${g.fill}`} /><span>{g.label}</span><b>{usd(g.amount)}</b></div>
          ))}
          {pays.slice(0, 2).map(p => (
            <div key={p.id} style={{ color: 'var(--ink-3)' }}><i className="sw grey" /><span>{p.poId} · {p.label}</span><b>{Math.round(pct(p.amount, total))}%</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ promise gauge */

function PromiseCard() {
  const { state } = useApp();
  const k = state.kpis;
  const share = k.promiseTotal ? Math.round(((k.promiseTotal - k.promiseBroken) / k.promiseTotal) * 100) : 100;
  // Semicircle split into five segments; filled ones carry the hatch.
  const segs = 5;
  const filled = (share / 100) * segs;
  const arc = (i: number) => {
    const gap = 0.05;
    const a0 = Math.PI * (1 - i / segs) - gap;
    const a1 = Math.PI * (1 - (i + 1) / segs) + gap;
    const r = 88, R = 118, cx = 125, cy = 128;
    const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)} ${cy - rad * Math.sin(a)}`;
    return `M ${p(a0, R)} A ${R} ${R} 0 0 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 0 0 ${p(a0, r)} Z`;
  };
  return (
    <div className="card">
      <div className="card-h" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Promise health</h2>
          <div className="card-sub">Pre-orders shipping on the date we promised</div>
        </div>
      </div>
      <div className="card-b">
        <div className="hero-figure" style={{ fontSize: 34, margin: '6px 0 4px' }}>{(k.promiseTotal - k.promiseBroken).toLocaleString()}<span className="muted" style={{ fontSize: 18 }}> / {k.promiseTotal}</span></div>
        <div className="small"><span className={k.promiseBroken ? 'down' : 'up'}>{k.promiseBroken} re-dated</span> <span className="muted">· {k.refunded} refunded · {k.kept} kept</span></div>
        <div className="gauge">
          <div className="gauge-art">
          <svg viewBox="0 0 250 140" role="img" aria-label={`${share}% of promises kept`}>
            <defs>
              <pattern id="hatchLime" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="#9cc65a" />
                <rect width="3" height="10" fill="#b5d77f" />
              </pattern>
              <pattern id="hatchStraw" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="#ece56c" />
                <rect width="3" height="10" fill="#f4ef9a" />
              </pattern>
            </defs>
            {Array.from({ length: segs }, (_, i) => (
              <path key={i} d={arc(i)} fill={i < Math.floor(filled) ? (i < 2 ? 'url(#hatchStraw)' : 'url(#hatchLime)') : i < filled ? 'url(#hatchLime)' : '#efefeb'} opacity={i < filled && i >= Math.floor(filled) ? 0.55 : 1} />
            ))}
          </svg>
          <div className="pct">{share}%</div>
          </div>
          <div className="cap">of promises kept</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ shipments */

function ShipmentsCard() {
  const { state } = useApp();
  return (
    <div className="card">
      <div className="card-h">
        <h2>Inbound shipments</h2>
        <div className="spacer" />
        <Link to="/intake" className="btn icon" aria-label="Add a purchase order"><Icon name="plus" size={16} /></Link>
      </div>
      <div className="card-b goals" style={{ paddingTop: 8 }}>
        {state.purchaseOrders.map((po: any) => {
          const product = state.products.find((p: any) => p.id === po.productId);
          const lands = po.keyDates?.airLaunch ?? po.keyDates?.launch;
          return (
            <div className="goal" key={po.id}>
              <img src={product?.image} alt="" />
              <div style={{ minWidth: 0 }}>
                <div className="top">
                  <b>{product?.name.split(' ').slice(-2).join(' ')}</b>
                  <span>{po.progress}%</span>
                </div>
                <div className="hbar thin"><span className={po.progress >= 70 ? 'fill-lime' : 'fill-apricot'} style={{ width: `${Math.max(po.progress, 3)}%` }} /></div>
                <div className="sub">{po.id} · {po.keyDates?.airLaunch ? 'air' : 'lands'} {fmtDate(lands)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ right column */

function PayPalPanel() {
  const { state } = useApp();
  const k = state.kpis;
  const sandbox = state.modes.paypal === 'sandbox';
  return (
    <div className="card">
      <div className="card-h" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>PayPal</h2>
          <div className="card-sub">Money in, money out</div>
        </div>
        <div className="spacer" />
        <a className="btn sm" href="/store" target="_blank" rel="noreferrer"><Icon name="store" size={15} /> Store</a>
      </div>
      <div className="card-b stack" style={{ gap: 20 }}>
        <div className="paycard-wrap">
          <div className="paycard">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small">Captured</span>
              <span className="brand">PayPal</span>
            </div>
            <div className="fig num">{usd(k.preorderRevenue)}</div>
            <div className="row tiny" style={{ justifyContent: 'space-between' }}>
              <span>{state.merchant.name}</span>
              <span>{sandbox ? 'Sandbox' : 'Simulated'} · USD</span>
            </div>
          </div>
          <div className="paycard-peek">Pay Later on</div>
        </div>
        <div className="quick">
          <a href="/portal/PO-1042" target="_blank" rel="noreferrer"><span className="tile"><Icon name="factory" size={20} /></span>Supplier</a>
          <Link to="/payments"><span className="tile"><Icon name="wallet" size={20} /></span>Payouts</Link>
          <Link to="/preorders"><span className="tile"><Icon name="receipt" size={20} /></span>Orders</Link>
          <Link to="/outbox"><span className="tile"><Icon name="mail" size={20} /></span>Notices</Link>
          <Link to="/timeline"><span className="tile"><Icon name="timeline" size={20} /></span>Plan</Link>
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="strong">Suppliers</span>
            <span className="muted tiny">paid by PayPal Payouts</span>
          </div>
          <div className="people">
            {state.suppliers.map((s: any, i: number) => (
              <div className="person" key={s.id}>
                <span className="avatar" style={{ background: ['var(--apricot)', 'var(--lime)', 'var(--ink)'][i % 3] }}>{s.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
                <span>{s.name.split(' ')[0]}</span>
                <small>{s.country}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
