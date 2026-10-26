import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { LandedGantt, type GanttHandle, type TimelineView } from '../components/LandedGantt';
import { Icon } from '../components/Icon';

const LEGEND: [string, string][] = [
  ['#f2a65e', 'Production'],
  ['#ece56c', 'AI QC'],
  ['#9cc65a', 'Sea / ground'],
  ['#6f9f37', 'Air'],
  ['#cfcfc8', 'Customs'],
  ['#b9b9b1', 'Warehouse'],
  ['#0070e0', 'PayPal scheduled'],
  ['#7fae3f', 'PayPal paid'],
];

export function Timeline() {
  const { state } = useApp();
  const ref = useRef<GanttHandle>(null);
  const [critical, setCritical] = useState(false);
  const [baseline, setBaseline] = useState(true);
  const [details, setDetails] = useState(false);
  const [view, setView] = useState<TimelineView>('weeks');
  const [po, setPo] = useState<string | null>(null);
  if (!state) return <div className="empty">Loading…</div>;
  const hasBaseline = state.proposals.some((p: any) => p.status === 'approved');

  const pickView = (v: TimelineView) => {
    setView(v);
    ref.current?.setView(v);
  };
  const pickPo = (id: string | null) => {
    setPo(id);
    ref.current?.showPO(id);
  };

  return (
    <>
      <div className="tl-toolbar">
        <div className="segmented" role="group" aria-label="Purchase order">
          <button className={po === null ? 'on' : ''} onClick={() => pickPo(null)}>All</button>
          {state.purchaseOrders.map((o: any) => (
            <button key={o.id} className={po === o.id ? 'on' : ''} onClick={() => pickPo(o.id)}>{o.id}</button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Zoom">
          {(['days', 'weeks', 'months'] as TimelineView[]).map(v => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => pickView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <button className="btn sm" onClick={() => ref.current?.goToday()}>Today</button>
        <div className="tl-spacer" />
        <button className={`btn sm ${details ? 'primary' : ''}`} onClick={() => setDetails(d => !d)} title="Show start, finish and PayPal columns">
          <Icon name="layers" size={16} /> Details
        </button>
        <button className={`btn sm ${critical ? 'primary' : ''}`} onClick={() => setCritical(c => !c)} title="Highlight the chain of tasks that sets the launch date">
          <Icon name="route" size={16} /> Critical path
        </button>
        <button
          className={`btn sm ${baseline && hasBaseline ? 'primary' : ''}`}
          disabled={!hasBaseline}
          onClick={() => setBaseline(b => !b)}
          title={hasBaseline ? 'Grey bars show the plan before the agent re-planned' : 'Appears after you approve a recovery plan'}
        >
          <Icon name="history" size={16} /> Before / after
        </button>
      </div>
      <div className="tl-legend">
        {LEGEND.map(([c, l]) => (
          <span key={l}><i className="sw" style={{ background: c }} />{l}</span>
        ))}
        <span className="tl-hint">Drag a bar to re-plan · right-click a payment or launch for PayPal actions · ask the Copilot (bottom right)</span>
      </div>
      <LandedGantt
        ref={ref}
        loadUrl="/api/project/load"
        editable
        details={details}
        criticalPath={critical}
        showBaselines={baseline && hasBaseline}
        today={state.modes.today}
        blackFriday={state.blackFriday}
        promise={state.kpis.heroPromise}
        aiModel={state.modes.model}
        aiProvider={state.modes.provider}
        aiLive={state.modes.ai === 'live'}
      />
    </>
  );
}
