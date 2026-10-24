import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { LandedGantt, type GanttHandle } from '../components/LandedGantt';
import { Icon } from '../components/Icon';

const LEGEND: [string, string][] = [
  ['#f2a65e', 'Production'],
  ['#ece56c', 'AI QC'],
  ['#9cc65a', 'Sea / ground'],
  ['#6f9f37', 'Air'],
  ['#cfcfc8', 'Customs'],
  ['#b9b9b1', 'Warehouse'],
  ['#0070e0', 'PayPal · scheduled'],
  ['#7fae3f', 'PayPal · paid'],
];

export function Timeline() {
  const { state } = useApp();
  const ref = useRef<GanttHandle>(null);
  const [critical, setCritical] = useState(false);
  const [baseline, setBaseline] = useState(true);
  if (!state) return <div className="empty">Loading…</div>;
  const hasBaseline = state.proposals.some((p: any) => p.status === 'approved');
  const g = () => ref.current?.gantt as any;
  return (
    <>
      <div className="tl-toolbar">
        <button className={`btn sm ${critical ? 'primary' : ''}`} onClick={() => setCritical(c => !c)}>
          <Icon name="route" /> Critical path
        </button>
        <button className={`btn sm ${baseline && hasBaseline ? 'primary' : ''}`} disabled={!hasBaseline} onClick={() => setBaseline(b => !b)} title={hasBaseline ? 'Grey bars show the plan before the agent re-planned' : 'Appears after you approve a recovery plan'}>
          <Icon name="layers" /> Plan before re-plan
        </button>
        <button className="btn sm" onClick={() => g()?.zoomIn()}><Icon name="zoom-in" /></button>
        <button className="btn sm" onClick={() => g()?.zoomOut()}><Icon name="zoom-out" /></button>
        <button className="btn sm" onClick={() => g()?.zoomToFit({ leftMargin: 40, rightMargin: 60 })}><Icon name="fit" /> Fit</button>
        <div className="legend" style={{ marginLeft: 8 }}>
          {LEGEND.map(([c, l]) => (
            <span key={l}><i className="sw" style={{ background: c }} />{l}</span>
          ))}
        </div>
        <span className="muted tiny" style={{ marginLeft: 'auto' }}>Right-click a payment or launch milestone for PayPal actions · drag bars to re-plan · Copilot bottom-right</span>
      </div>
      <LandedGantt
        ref={ref}
        loadUrl="/api/project/load"
        editable
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
