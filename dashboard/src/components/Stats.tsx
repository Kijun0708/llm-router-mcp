import type { DashboardState } from '../types';
import './Stats.css';

interface Props {
  state: DashboardState;
}

export function Stats({ state }: Props) {
  const { cacheStats, backgroundTasks, totalCalls, sessions } = state;
  const activeCount = Object.keys(state.activeCalls).length;
  const sessionCount = Object.keys(sessions).length;

  return (
    <div className="panel">
      <h2 className="panel-title">STATS</h2>
      <div className="metrics">
        <div className="metric">
          <span className="metric-label">Total Calls</span>
          <span className="metric-value">{totalCalls}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Active</span>
          <span className="metric-value accent-green">{activeCount}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Sessions</span>
          <span className="metric-value">{sessionCount}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Cache Hit</span>
          <span className="metric-value">{cacheStats.hitRate || 0}%</span>
        </div>
        <div className="metric">
          <span className="metric-label">Cache Size</span>
          <span className="metric-value">{cacheStats.size}/{cacheStats.maxSize}</span>
        </div>
        <div className="metric">
          <span className="metric-label">BG Running</span>
          <span className="metric-value accent-green">{backgroundTasks.running}</span>
        </div>
        <div className="metric">
          <span className="metric-label">BG Pending</span>
          <span className="metric-value accent-amber">{backgroundTasks.pending}</span>
        </div>
        <div className="metric">
          <span className="metric-label">BG Completed</span>
          <span className="metric-value">{backgroundTasks.completed}</span>
        </div>
        <div className="metric">
          <span className="metric-label">BG Failed</span>
          <span className="metric-value accent-red">{backgroundTasks.failed}</span>
        </div>
      </div>
    </div>
  );
}
