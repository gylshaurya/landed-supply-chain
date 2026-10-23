import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { AIHelper, AnthropicPlugin, DateHelper, Gantt, GooglePlugin, StringHelper, TaskModel } from '@bryntum/gantt';
import { api, usd } from '../lib/api';
import { useApp } from '../lib/store';
import { toast } from './Toast';

/** Task model with Landed's domain fields; descriptions also teach Bryntum's AI Copilot what they mean. */
class LandedTask extends TaskModel {
  static $name = 'LandedTask';
  static fields = [
    { name: 'kind', type: 'string', description: 'Task type: payment (PayPal supplier payment milestone), production, qc (AI quality inspection), freight, air, customs, warehouse, launch (pre-orders ship)' },
    { name: 'poId', type: 'string', description: 'Purchase order the task belongs to, e.g. PO-1042' },
    { name: 'paymentStatus', type: 'string', description: 'For payment milestones: PayPal Payouts status — scheduled, held (blocked by failed QC), processing, paid, failed' },
    { name: 'amount', type: 'number', description: 'USD amount of the PayPal supplier payment milestone' },
    { name: 'paymentId', type: 'string' },
    { name: 'payoutBatchId', type: 'string', description: 'PayPal payout batch id once paid' },
    { name: 'note', type: 'string', description: 'Why the task has its current duration' },
    { name: 'addedBy', type: 'string', description: '"agent" if the recovery agent added the task' },
  ];
}

export interface GanttHandle {
  gantt: Gantt | null;
}

interface Props {
  loadUrl: string;
  editable?: boolean;
  showBaselines?: boolean;
  criticalPath?: boolean;
  today: string;
  blackFriday: string;
  promise?: string;
  aiModel?: string;
  aiProvider?: string;
  aiLive?: boolean;
  onReady?: (g: Gantt) => void;
}

const PAY_LABEL: Record<string, string> = { paid: 'Paid', scheduled: 'Scheduled', processing: 'Sending…', held: 'Held · QC', failed: 'Failed' };

export const LandedGantt = forwardRef<GanttHandle, Props>(function LandedGantt(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<Gantt | null>(null);
  const { version, lastChange } = useApp();
  useImperativeHandle(ref, () => ({ get gantt() { return ganttRef.current; } }), []);

  useEffect(() => {
    if (!host.current) return;
    const { editable = false } = props;

    const gantt = new Gantt({
      appendTo: host.current,
      project: {
        taskModelClass: LandedTask,
        loadUrl: props.loadUrl,
        ...(editable ? { syncUrl: '/api/project/sync', autoSync: true } : {}),
        autoLoad: true,
        validateResponse: false,
      } as any,
      subGridConfigs: { locked: { width: 520 } },
      startDate: '2026-08-24',
      endDate: '2027-01-04',
      viewPreset: {
        base: 'weekAndMonth',
        timeResolution: { unit: 'day', increment: 1 },
        headers: [
          { unit: 'month', dateFormat: 'MMMM YYYY' },
          { unit: 'week', dateFormat: 'MMM D' },
        ],
      },
      tickSize: 58,
      rowHeight: 42,
      barMargin: 8,
      readOnly: !editable,
      columnLines: false,
      transitionDuration: 450,
      columns: [
        {
          type: 'name',
          width: 232,
          renderer: ({ record }: any) => ({
            children: [
              { tag: 'span', text: record.name },
              record.addedBy === 'agent' && !record.isParent ? { tag: 'span', class: 'badge amber', style: 'margin-left:6px;font-size:10px;padding:1px 6px', text: 'agent' } : null,
            ],
          }),
        },
        { type: 'startdate', text: 'Start', width: 66, format: 'MMM D' },
        { type: 'enddate', text: 'Finish', width: 66, format: 'MMM D' },
        {
          text: 'PayPal',
          field: 'paymentStatus',
          width: 158,
          htmlEncode: false,
          renderer: ({ record }: any) =>
            record.kind === 'payment'
              ? StringHelper.xss`<span class="cell-pay"><span class="badge ${record.paymentStatus === 'paid' ? 'green' : record.paymentStatus === 'held' || record.paymentStatus === 'failed' ? 'amber' : 'blue'}">${PAY_LABEL[record.paymentStatus] ?? record.paymentStatus}</span> ${usd(record.amount)}</span>`
              : '',
        },
      ],
      features: {
        criticalPaths: { disabled: !props.criticalPath },
        baselines: { disabled: !props.showBaselines },
        projectLines: false,
        progressLine: false,
        timeRanges: { showCurrentTimeLine: false, showHeaderElements: true },
        dependencies: { radius: 6 },
        labels: {
          after: {
            renderer: ({ taskRecord }: any) => {
              if (taskRecord.kind === 'payment') return StringHelper.xss`<span class="lbl-pay ${taskRecord.paymentStatus}">${usd(taskRecord.amount)} · ${PAY_LABEL[taskRecord.paymentStatus] ?? ''}</span>`;
              if (taskRecord.kind === 'launch') return StringHelper.xss`<span class="lbl-launch">${taskRecord.name} · ${DateHelper.format(taskRecord.endDate, 'MMM D')}</span>`;
              return '';
            },
          },
        },
        taskTooltip: {
          template: ({ taskRecord }: any) => StringHelper.xss`
            <div class="tt"><b>${taskRecord.name}</b><br>
            ${DateHelper.format(taskRecord.startDate, 'ddd MMM D')} → ${DateHelper.format(taskRecord.endDate, 'ddd MMM D')} · ${taskRecord.duration} days<br>
            ${taskRecord.note ? `<i>${taskRecord.note}</i><br>` : ''}
            ${taskRecord.kind === 'payment' ? `PayPal payout: ${usd(taskRecord.amount)} — ${taskRecord.paymentStatus}${taskRecord.payoutBatchId ? ` (${taskRecord.payoutBatchId})` : ''}` : ''}
            ${taskRecord.critical ? '<br><b style="color:#dc2626">On the critical path</b>' : ''}</div>`,
        },
        taskMenu: {
          items: {
            releasePayment: {
              icon: 'fa fa-circle-dollar-to-slot',
              text: 'Release PayPal payment now',
              weight: 1,
              async onItem({ taskRecord }: any) {
                const r = await api(`/api/payments/${taskRecord.paymentId}/release`, { method: 'POST' });
                toast(r.status === 'paid' ? `Paid ${usd(r.amount)} via PayPal Payouts (${r.payoutBatchId})` : `Payout ${r.status}: ${r.holdReason ?? ''}`);
              },
            },
            receiveShipment: {
              icon: 'fa fa-dolly',
              text: 'Mark goods received → ship pre-orders',
              weight: 2,
              async onItem({ taskRecord }: any) {
                const r = await api(`/api/shipments/${taskRecord.id}/receive`, { method: 'POST' });
                toast(`Shipped ${r.shipped} pre-orders${r.tracked ? `, ${r.tracked} tracking numbers sent to PayPal` : ''}; ${r.restocked} units back in stock.`);
              },
            },
          },
          processItems({ taskRecord, items }: any) {
            if (!(taskRecord.kind === 'payment' && ['scheduled', 'held', 'failed'].includes(taskRecord.paymentStatus))) items.releasePayment = false;
            if (!(taskRecord.kind === 'launch' && taskRecord.percentDone < 100)) items.receiveShipment = false;
          },
        },
        ...(editable && props.aiLive !== undefined
          ? {
              ai: {
                promptUrl: '/api/ai/bryntum',
                apiPlugin: props.aiProvider === 'gemini' ? GooglePlugin : AnthropicPlugin,
                model: props.aiModel,
                requireConfirmationOnRemovals: true,
                showNoConnectionIcon: false,
                chatButton: {
                  tooltip: 'Landed Copilot (Bryntum AI)',
                  chatPanel: {
                    title: 'Landed Copilot',
                    intro: { html: 'Ask about the plan, move tasks, or run a what-if. I can see every PayPal payment milestone.' },
                    examplePrompts: [
                      'Which tasks are on the critical path for PO-1042?',
                      'What if the factory slips 8 more days and we air-freight 120 units?',
                      'Show me every PayPal payment that is not paid yet',
                    ],
                    width: '28em',
                  },
                },
                tools: {
                  simulateSupplierDelay: AIHelper.createBasicTool({
                    description:
                      'Runs Landed\'s schedule + demand simulator for a what-if on a purchase order without changing the plan. Returns first ship date, late pre-orders, lost revenue, expected refunds, costs and total impact in USD.',
                    properties: {
                      poId: { type: 'string', description: 'Purchase order id, e.g. PO-1042' },
                      delayDays: { type: 'number', description: 'Extra production days' },
                      airUnits: { type: 'number', description: 'Units to split off by air freight (max 160)' },
                    },
                    required: ['poId', 'delayDays'],
                    available: true,
                    async fn({ args }: any) {
                      const r = await api('/api/simulate', { method: 'POST', json: { poId: args.poId, delayDays: args.delayDays, airUnits: args.airUnits ?? 0 } });
                      return AIHelper.result(r, 'Simulation complete');
                    },
                  } as any),
                },
              },
            }
          : {}),
      } as any,
      taskRenderer: ({ taskRecord }: any) => (taskRecord.isLeaf && !taskRecord.isMilestone ? StringHelper.encodeHtml(taskRecord.name) : ''),
    } as any);

    ganttRef.current = gantt;
    // Open on the interesting window (a couple of weeks back from today) once data is in.
    gantt.project.on('load', () => {
      // React StrictMode mounts twice; ignore loads that finish after an instance was destroyed.
      if ((gantt as any).isDestroyed) return;
      const d = new Date(`${props.today}T00:00:00`);
      d.setDate(d.getDate() - 24);
      void (gantt as any).scrollToDate(d, { block: 'start', animate: false });
    });
    props.onReady?.(gantt);
    return () => {
      gantt.destroy();
      ganttRef.current = null;
    };
    // Re-create only when the data source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.loadUrl, props.editable, props.aiLive, props.aiProvider]);

  // Live updates from agents / other tabs.
  useEffect(() => {
    const g = ganttRef.current;
    if (!g || version === 0) return;
    if (lastChange?.source === 'gantt' && props.editable) return;
    if (lastChange?.scope === 'activity') return;
    void (g.project as any).load();
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = ganttRef.current as any;
    if (g) g.features.criticalPaths.disabled = !props.criticalPath;
  }, [props.criticalPath]);

  useEffect(() => {
    const g = ganttRef.current as any;
    if (g) g.features.baselines.disabled = !props.showBaselines;
  }, [props.showBaselines]);

  return <div className="bryntum-host" ref={host} />;
});
