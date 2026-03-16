import { useMemo } from 'react';
import type { DashboardState, CallHistoryEntry } from '../types';
import { formatDuration } from '../utils/formatters';
import './Stats.css';

interface Props {
  state: DashboardState;
  history: CallHistoryEntry[];
}

function computeLatencyStats(history: CallHistoryEntry[]) {
  const durations = history
    .filter(e => e.success && !e.fromCache)
    .map(e => e.durationMs)
    .sort((a, b) => a - b);
  if (durations.length < 2) return null;
  return {
    p50: durations[Math.floor(durations.length * 0.5)],
    p95: durations[Math.floor(durations.length * 0.95)],
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
  };
}

function computeCacheSaved(history: CallHistoryEntry[], avgMs: number): number {
  const cacheHits = history.filter(e => e.fromCache).length;
  return cacheHits * avgMs;
}

export function Stats({ state, history }: Props) {
  const { cacheStats, backgroundTasks, totalCalls, sessions } = state;
  const activeCount = Object.keys(state.activeCalls).length;
  const sessionCount = Object.keys(sessions).length;

  const latency = useMemo(() => computeLatencyStats(history), [history]);
  const cacheSavedMs = useMemo(
    () => latency ? computeCacheSaved(history, latency.avg) : 0,
    [history, latency]
  );

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
          <span className="metric-value">
            {cacheStats.hitRate || 0}%
            {cacheSavedMs > 0 && (
              <span className="saved-label"> (~{formatDuration(cacheSavedMs)})</span>
            )}
          </span>
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
        {latency && (
          <>
            <div className="metric metric-latency">
              <span className="metric-label">Latency p50</span>
              <span className="metric-value">{formatDuration(latency.p50)}</span>
            </div>
            <div className="metric metric-latency">
              <span className="metric-label">Latency p95</span>
              <span className="metric-value accent-amber">{formatDuration(latency.p95)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
