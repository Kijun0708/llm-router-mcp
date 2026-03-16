import { useState, useEffect } from 'react';
import type { ActiveCall } from '../types';
import { formatDuration } from '../utils/formatters';
import { SessionBadge } from './SessionBadge';
import './ActiveCalls.css';

interface Props {
  calls: Record<string, ActiveCall>;
}

// Model-specific timeout thresholds (ms)
const MODEL_TIMEOUTS: Record<string, number> = {
  'gpt': 300000,       // 5 min
  'o1': 300000,
  'o3': 300000,
  'codex': 300000,
  'gemini-pro': 120000, // 2 min
  'gemini-2': 120000,
  'gemini-flash': 90000, // 1.5 min
};

function getTimeoutForModel(model: string): number {
  const m = model.toLowerCase();
  for (const [key, timeout] of Object.entries(MODEL_TIMEOUTS)) {
    if (m.includes(key)) return timeout;
  }
  return 120000; // default 2 min
}

function getTimeoutLevel(ratio: number): string {
  if (ratio >= 0.8) return 'danger';
  if (ratio >= 0.5) return 'warn';
  return 'ok';
}

export function ActiveCalls({ calls }: Props) {
  const [now, setNow] = useState(Date.now());
  const entries = Object.values(calls);

  useEffect(() => {
    if (entries.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="panel">
        <h2 className="panel-title">ACTIVE CALLS</h2>
        <div className="empty-state">대기 중</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2 className="panel-title">
        ACTIVE CALLS <span className="count-badge">{entries.length}</span>
      </h2>
      <div className="calls-list">
        {entries.map((call) => {
          const elapsed = now - new Date(call.startedAt).getTime();
          const timeout = getTimeoutForModel(call.model);
          const ratio = elapsed / timeout;
          const level = getTimeoutLevel(ratio);
          const pct = Math.min(ratio * 100, 100);

          return (
            <div key={call.id} className="call-item">
              <div className="call-info">
                <span className="status-dot active" />
                <span className="expert-name">{call.expertId}</span>
                <span className={`provider-badge ${call.provider}`}>
                  {call.provider}
                </span>
                <span className="model-name">{call.model}</span>
                {call.callPhase && (
                  <span className="call-phase">{call.callPhase}</span>
                )}
                {call.workflowId && (
                  <span className="call-workflow-tag">workflow</span>
                )}
                {call.sessionId && <SessionBadge sessionId={call.sessionId} />}
              </div>
              <div className="call-right">
                <div className="timeout-bar-track">
                  <div
                    className={`timeout-bar-fill level-${level}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`timer timer-${level}`}>{formatDuration(elapsed)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
