import { useState, useEffect } from 'react';
import type { ActiveCall } from '../types';
import { formatDuration } from '../utils/formatters';
import { SessionBadge } from './SessionBadge';
import './ActiveCalls.css';

interface Props {
  calls: Record<string, ActiveCall>;
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
          return (
            <div key={call.id} className="call-item">
              <div className="call-info">
                <span className="status-dot active" />
                <span className="expert-name">{call.expertId}</span>
                <span className={`provider-badge ${call.provider}`}>
                  {call.provider}
                </span>
                {call.callPhase && (
                  <span className="call-phase">{call.callPhase}</span>
                )}
                {call.workflowId && (
                  <span className="call-workflow-tag">workflow</span>
                )}
                {call.sessionId && <SessionBadge sessionId={call.sessionId} />}
              </div>
              <span className="timer">{formatDuration(elapsed)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
