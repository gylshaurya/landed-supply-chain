import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { AgentConsole } from './AgentConsole';
import { Icon } from './Icon';

export const SAMPLE_DELAY =
  'Hello Kiln & Co team, very sorry, our second kiln had a heating element failure this week. Production of PO-1042 needs 12 more days. If you can pay $1,800 for overtime (weekend shifts + rented kiln time) we can save 5 days.';

/** Lets the merchant (or the supplier portal) post a supplier update and watch the agent respond. */
export function DelayComposer({ poId = 'PO-1042', compact = false }: { poId?: string; compact?: boolean }) {
  const { agent, clearAgent } = useApp();
  const nav = useNavigate();
  const [msg, setMsg] = useState(SAMPLE_DELAY);
  const [started, setStarted] = useState(0);
  const events = agent.filter(e => e.ts >= started);
  const done = events.find(e => e.kind === 'done' || e.kind === 'error');
  const proposalId = events.find(e => e.proposalId)?.proposalId as string | undefined;
  const running = !!started && !done;

  async function send() {
    clearAgent();
    setStarted(Date.now() - 50);
    try {
      await api(`/api/supplier/${poId}/update`, { method: 'POST', json: { message: msg } });
    } catch (e) {
      setStarted(0);
      alert((e as Error).message);
    }
  }

  return (
    <div className="stack">
      {!started && (
        <>
          <label className="f">
            Message from the supplier
            <textarea className="input" value={msg} onChange={e => setMsg(e.target.value)} rows={compact ? 3 : 4} />
          </label>
          <div className="row">
            <button className="btn primary" onClick={send} disabled={!msg.trim()}>
              <Icon name="send" /> Send update to Landed
            </button>
            <span className="muted small">The recovery agent reads it, re-plans, and proposes a fix.</span>
          </div>
        </>
      )}
      {!!started && <AgentConsole events={events} running={running} />}
      {proposalId && (
        <div className="row">
          <button className="btn primary lg" onClick={() => nav(`/proposals/${proposalId}`)}>
            <Icon name="clipboard" /> Review recovery plan
          </button>
        </div>
      )}
      {done?.kind === 'error' && (
        <button className="btn" onClick={() => setStarted(0)}>Try again</button>
      )}
    </div>
  );
}

/** Runs the recovery agent against the current (hand-edited) plan. */
export function RecoverButton({ poId = 'PO-1042' }: { poId?: string }) {
  const { agent, clearAgent } = useApp();
  const nav = useNavigate();
  const [started, setStarted] = useState(0);
  const events = agent.filter(e => e.ts >= started);
  const done = events.find(e => e.kind === 'done' || e.kind === 'error');
  const proposalId = events.find(e => e.proposalId)?.proposalId as string | undefined;
  async function go() {
    clearAgent();
    setStarted(Date.now() - 50);
    await api(`/api/recover/${poId}`, { method: 'POST' });
  }
  return (
    <div className="stack">
      {!started && (
        <div className="row">
          <button className="btn primary lg" onClick={go}><Icon name="sparkles" /> Ask the recovery agent</button>
          <span className="muted small">It simulates fixes (air freight, overtime, customer notices) and proposes the best one.</span>
        </div>
      )}
      {!!started && <AgentConsole events={events} running={!done} />}
      {proposalId && <button className="btn primary lg" onClick={() => nav(`/proposals/${proposalId}`)}><Icon name="clipboard" /> Review recovery plan</button>}
    </div>
  );
}
