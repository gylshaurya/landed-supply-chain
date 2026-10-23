import { useEffect, useRef, useState } from 'react';
import { Grid, StringHelper } from '@bryntum/gantt';
import { api, fmtDate, usd } from '../lib/api';
import { useApp } from '../lib/store';

const STATUS: Record<string, [string, string]> = {
  active: ['blue', 'Promised'],
  kept: ['green', 'Kept · new date'],
  refunded: ['red', 'Refunded'],
  cancelled: ['red', 'Cancelled'],
  shipped: ['violet', 'Shipped'],
};

export function Preorders() {
  const { version, state } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const grid = useRef<Grid | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!host.current) return;
    const g = new Grid({
      appendTo: host.current,
      rowHeight: 44,
      features: { filterBar: true, group: false, sort: 'createdAt' },
      columns: [
        { text: 'Customer', field: 'customerName', width: 190 },
        { text: 'Email', field: 'email', flex: 1, minWidth: 200 },
        { text: 'Qty', field: 'qty', width: 60, align: 'center' },
        { text: 'Paid', field: 'amount', width: 90, renderer: ({ value }: any) => usd(value) },
        { text: 'Ordered', field: 'createdAt', width: 100, renderer: ({ value }: any) => fmtDate(value) },
        { text: 'Promised', field: 'promisedDate', width: 100, renderer: ({ value }: any) => fmtDate(value) },
        { text: 'Revised', field: 'revisedDate', width: 100, renderer: ({ value }: any) => (value ? fmtDate(value) : '') },
        {
          text: 'Status',
          field: 'status',
          width: 170,
          htmlEncode: false,
          renderer: ({ record }: any) => {
            const [c, l] = STATUS[record.status] ?? ['', record.status];
            const awaiting = record.status === 'active' && record.noticeSentAt;
            return StringHelper.xss`<span class="badge ${awaiting ? 'amber' : c}">${awaiting ? 'Notice sent · deciding' : l}</span>`;
          },
        },
        {
          text: 'PayPal',
          field: 'captureId',
          width: 230,
          htmlEncode: false,
          renderer: ({ record }: any) =>
            record.source === 'seed'
              ? '<span class="muted tiny">seeded order (simulated)</span>'
              : StringHelper.xss`<span class="mono">${record.refundId ? `refund ${record.refundId}` : `capture ${record.captureId}`}</span>`,
        },
        {
          text: 'Notice',
          field: 'noticeToken',
          width: 90,
          htmlEncode: false,
          renderer: ({ value }: any) => (value ? StringHelper.xss`<a href="/notice/${value}" target="_blank">open</a>` : ''),
        },
      ],
    } as any);
    grid.current = g;
    return () => g.destroy();
  }, []);

  useEffect(() => {
    void api<any[]>('/api/preorders').then(d => {
      setRows(d);
      if (grid.current) (grid.current as any).store.data = [...d].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }, [version]);

  const notices = rows.filter(r => r.noticeSentAt);
  return (
    <>
      <div className="tl-toolbar">
        <span className="badge blue">{rows.filter(r => r.status === 'active' || r.status === 'kept').length} open</span>
        <span className="badge amber">{notices.filter(r => r.status === 'active').length} deciding</span>
        <span className="badge green">{rows.filter(r => r.status === 'kept').length} kept</span>
        <span className="badge red">{rows.filter(r => r.status === 'refunded').length} refunded</span>
        <span className="badge violet">{rows.filter(r => r.status === 'shipped').length} shipped</span>
        <div style={{ flex: 1 }} />
        <a className="btn sm" href="/store" target="_blank" rel="noreferrer"><i className="fa fa-store" /> Place a real sandbox pre-order</a>
        <span className="muted tiny">{state?.modes.paypal === 'sandbox' ? 'Live PayPal sandbox captures & refunds' : 'PayPal simulated'}</span>
      </div>
      <div className="bryntum-host" ref={host} />
    </>
  );
}
