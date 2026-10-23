import { useEffect, useRef } from 'react';
import { Scheduler, StringHelper } from '@bryntum/gantt';
import { api } from '../lib/api';
import { useApp } from '../lib/store';

export function Runway() {
  const { state, version } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const sched = useRef<Scheduler | null>(null);
  const ready = !!state;

  useEffect(() => {
    if (!host.current || !ready) return;
    const s = new Scheduler({
      appendTo: host.current,
      startDate: '2026-10-19',
      endDate: '2027-01-04',
      viewPreset: {
        base: 'weekAndMonth',
        timeResolution: { unit: 'day', increment: 1 },
        headers: [
          { unit: 'month', dateFormat: 'MMMM YYYY' },
          { unit: 'week', dateFormat: 'MMM D' },
        ],
      },
      tickSize: 80,
      rowHeight: 74,
      barMargin: 14,
      readOnly: true,
      eventStyle: 'rounded',
      milestoneLayoutMode: 'measure',
      milestoneTextPosition: 'always-outside',
      columns: [
        {
          text: 'Product',
          field: 'name',
          width: 300,
          htmlEncode: false,
          renderer: ({ record }: any) =>
            StringHelper.xss`<div style="display:flex;gap:10px;align-items:center"><img src="${record.image}" style="width:46px;height:36px;object-fit:cover;border-radius:8px;border:1px solid #e6e3db"><div><div style="font-weight:650">${record.name}</div><div style="color:#7c847e;font-size:12px">${record.sku} · ${record.stock} on hand</div></div></div>`,
        },
      ],
      features: {
        timeRanges: { showCurrentTimeLine: false, showHeaderElements: true },
        eventTooltip: { template: ({ eventRecord }: any) => StringHelper.xss`<b>${eventRecord.name}</b><br>${eventRecord.startDate.toDateString()} → ${eventRecord.endDate.toDateString()}` },
      },
      eventRenderer: ({ eventRecord }: any) => StringHelper.encodeHtml(eventRecord.name),
    } as any);
    (s.project as any).timeRangeStore.add([
      { id: 'today', name: 'Today', startDate: state.modes.today, cls: 'tr-today' },
      { id: 'bf', name: 'BF → CM', startDate: state.blackFriday, duration: 4, durationUnit: 'day', cls: 'tr-bf' },
    ]);
    sched.current = s;
    return () => {
      s.destroy();
      sched.current = null;
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = sched.current as any;
    if (!s) return;
    void api('/api/runway').then(d => {
      s.resourceStore.data = d.resources;
      s.eventStore.data = d.events;
    });
  }, [version, ready]);

  return (
    <>
      <div className="tl-toolbar">
        <div className="legend">
          <span><i className="sw" style={{ background: '#16a34a' }} />In stock</span>
          <span><i className="sw" style={{ background: '#d97706' }} />Sold out · taking pre-orders</span>
          <span><i className="sw" style={{ background: '#dc2626' }} />Sold out · losing sales</span>
          <span><i className="sw" style={{ background: '#1d4ed8' }} />Inbound shipment lands</span>
        </div>
        <div style={{ flex: 1 }} />
        <span className="muted tiny">Bryntum Scheduler · recalculated from the live plan and the demand model every time the schedule changes</span>
      </div>
      <div className="bryntum-host" ref={host} />
    </>
  );
}
