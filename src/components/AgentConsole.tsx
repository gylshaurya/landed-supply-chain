import { useEffect, useRef } from 'react';
import type { AgentEvent } from '../lib/store';

export function AgentConsole({ events, running }: { events: AgentEvent[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);
  return (
    <div className="agent-console" ref={ref}>
      {events.map((e, i) => {
        if (e.kind === 'trace') {
          return (
            <div className="ln" key={i}>
              <span className="tool">›</span>
              <span><span className="tool">{e.tool}</span> {e.summary}</span>
            </div>
          );
        }
        const cls = e.kind === 'error' ? 'err' : e.kind === 'done' ? 'ok' : e.kind === 'check' ? 'tool' : '';
        return (
          <div className="ln" key={i}>
            <span className={cls}>{e.kind === 'done' ? '✓' : e.kind === 'error' ? '✕' : '•'}</span>
            <span className={cls}>{e.text}</span>
          </div>
        );
      })}
      {running && (
        <div className="ln">
          <span className="spin"><i className="fa fa-circle-notch fa-spin" /></span>
          <span className="spin">agent working…</span>
        </div>
      )}
    </div>
  );
}
