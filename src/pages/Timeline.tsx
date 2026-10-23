import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { LandedGantt, type GanttHandle } from '../components/LandedGantt';

const LEGEND: [string, string][] = [
  ['#c2410c', 'Production'],
  ['#7c3aed', 'AI QC inspection'],
  ['#0f766e', 'Ocean / ground freight'],
  ['#0284c7', 'Air freight'],
  ['#57534e', 'Customs'],
  ['#4d7c0f', 'Warehouse'],
  ['#0070e0', 'PayPal payment · scheduled'],
  ['#16a34a', 'PayPal payment · paid'],
  ['#d97706', 'PayPal payment · held'],
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
          <i className="fa fa-route" /> Critical path
        </button>
        <button className={`btn sm ${baseline && hasBaseline ? 'primary' : ''}`} disabled={!hasBaseline} onClick={() => setBaseline(b => !b)} title={hasBaseline ? 'Grey bars show the plan before the agent re-planned' : 'Appears after you approve a recovery plan'}>
          <i className="fa fa-layer-group" /> Plan before re-plan
        </button>
        <button className="btn sm" onClick={() => g()?.zoomIn()}><i className="fa fa-magnifying-glass-plus" /></button>
        <button className="btn sm" onClick={() => g()?.zoomOut()}><i className="fa fa-magnifying-glass-minus" /></button>
        <button className="btn sm" onClick={() => g()?.zoomToFit({ leftMargin: 40, rightMargin: 60 })}><i className="fa fa-arrows-left-right-to-line" /> Fit</button>
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
        aiLive={state.modes.ai === 'live'}
      />
    </>
  );
}
