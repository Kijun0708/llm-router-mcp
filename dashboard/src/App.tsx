import { useWebSocket } from './hooks/useWebSocket';
import { useDashboardState } from './hooks/useDashboardState';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ActiveCalls } from './components/ActiveCalls';
import { Stats } from './components/Stats';
import { RateLimits } from './components/RateLimits';
import { CallHistory } from './components/CallHistory';
import './App.css';

export default function App() {
  const { connected, lastEvent } = useWebSocket();
  const state = useDashboardState(lastEvent);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">LLM ROUTER DASHBOARD</h1>
        <ConnectionStatus connected={connected} />
      </header>

      <main className="main-grid">
        <div className="grid-area-active">
          <ActiveCalls calls={state.activeCalls} />
        </div>

        <div className="grid-area-stats">
          <Stats state={state} />
        </div>

        <div className="grid-area-ratelimits">
          <RateLimits limits={state.rateLimits} />
        </div>

        <div className="grid-area-history">
          <CallHistory
            history={state.callHistory}
            activeCalls={state.activeCalls}
            workflows={state.workflows}
          />
        </div>
      </main>
    </div>
  );
}
