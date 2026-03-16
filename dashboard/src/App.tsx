import { useState, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useDashboardState } from './hooks/useDashboardState';
import { ConnectionStatus } from './components/ConnectionStatus';
import { HealthBar } from './components/HealthBar';
import { SessionFilter } from './components/SessionFilter';
import { ActiveCalls } from './components/ActiveCalls';
import { Stats } from './components/Stats';
import { RateLimits } from './components/RateLimits';
import { CallHistory } from './components/CallHistory';
import './App.css';

export default function App() {
  const { connected, lastEvent } = useWebSocket();
  const state = useDashboardState(lastEvent);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const filteredActiveCalls = useMemo(() => {
    if (!selectedSession) return state.activeCalls;
    const filtered: typeof state.activeCalls = {};
    for (const [id, call] of Object.entries(state.activeCalls)) {
      if (call.sessionId === selectedSession) filtered[id] = call;
    }
    return filtered;
  }, [state.activeCalls, selectedSession]);

  const filteredHistory = useMemo(() => {
    if (!selectedSession) return state.callHistory;
    return state.callHistory.filter((e) => e.sessionId === selectedSession);
  }, [state.callHistory, selectedSession]);

  const filteredWorkflows = useMemo(() => {
    if (!selectedSession) return state.workflows;
    const filtered: typeof state.workflows = {};
    for (const [id, wf] of Object.entries(state.workflows)) {
      if (wf.sessionId === selectedSession) filtered[id] = wf;
    }
    return filtered;
  }, [state.workflows, selectedSession]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">LLM ROUTER DASHBOARD</h1>
        <div className="header-controls">
          <SessionFilter
            sessions={state.sessions}
            selected={selectedSession}
            onSelect={setSelectedSession}
          />
          <ConnectionStatus connected={connected} />
        </div>
      </header>

      <HealthBar
        concurrency={state.concurrency}
        rateLimits={state.rateLimits}
        backgroundTasks={state.backgroundTasks}
      />

      <main className="main-grid">
        <div className="grid-area-active">
          <ActiveCalls calls={filteredActiveCalls} />
        </div>

        <div className="grid-area-stats">
          <Stats state={state} history={state.callHistory} />
        </div>

        <div className="grid-area-ratelimits">
          <RateLimits limits={state.rateLimits} />
        </div>

        <div className="grid-area-history">
          <CallHistory
            history={filteredHistory}
            activeCalls={filteredActiveCalls}
            workflows={filteredWorkflows}
          />
        </div>
      </main>
    </div>
  );
}
