import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';

export interface AgentEvent {
  kind: string;
  text?: string;
  tool?: string;
  summary?: string;
  proposalId?: string;
  ts: number;
  [k: string]: unknown;
}

interface Ctx {
  state: any | null;
  refresh: () => Promise<void>;
  agent: AgentEvent[];
  clearAgent: () => void;
  version: number; // bumps whenever the server reports a change
  lastChange: { scope?: string; source?: string } | null;
}

const AppCtx = createContext<Ctx>({ state: null, refresh: async () => {}, agent: [], clearAgent: () => {}, version: 0, lastChange: null });

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<any>(null);
  const [agent, setAgent] = useState<AgentEvent[]>([]);
  const [version, setVersion] = useState(0);
  const [lastChange, setLastChange] = useState<Ctx['lastChange']>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setState(await api('/api/state'));
  }, []);

  const soon = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void refresh(), 120);
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const es = new EventSource('/api/events');
    es.addEventListener('change', e => {
      setLastChange(JSON.parse((e as MessageEvent).data));
      setVersion(v => v + 1);
      soon();
    });
    es.addEventListener('activity', soon);
    es.addEventListener('agent', e => {
      const data = JSON.parse((e as MessageEvent).data);
      setAgent(a => [...a, { ...data, ts: Date.now() }].slice(-80));
    });
    return () => es.close();
  }, [refresh, soon]);

  return (
    <AppCtx.Provider value={{ state, refresh, agent, clearAgent: () => setAgent([]), version, lastChange }}>{children}</AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
