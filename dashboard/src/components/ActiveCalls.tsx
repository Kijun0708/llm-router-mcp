import { useState, useEffect } from 'react';
import type { ActiveCall } from '../types';
import { formatDuration } from '../utils/formatters';
import { SessionBadge } from './SessionBadge';
import './ActiveCalls.css';

interface Props {
  calls: Record<string, ActiveCall>;
}

// 진행바 기준이 되는 모델별 타임아웃 (ms).
// 서버의 src/services/providers/model-registry.ts와 값을 맞춰야 한다.
// (이전 표는 codex를 5분으로 표시했는데 서버 실제값은 20분이었고,
//  gemini-3 키가 없어 모든 Gemini 3 모델이 기본값 2분으로 떨어졌다.)
const MODEL_TIMEOUTS: Record<string, number> = {
  'gpt-5.5': 1_200_000,              // 20 min
  'gemini-3.1-pro-high': 900_000,    // 15 min
  'gemini-3.1-pro-low': 600_000,     // 10 min
  'gemini-3.6-flash': 300_000,       // 5 min
  'gemini-3.5-flash': 300_000,
  'claude-opus-4-6-thinking': 900_000,
  'claude-sonnet-4-6': 600_000,
  'gpt-oss-120b': 600_000,
  'opus': 300_000,                   // claude -p
  'sonnet': 300_000,
};

function getTimeoutForModel(model: string): number {
  const m = model.toLowerCase();
  // 정확 일치 우선, 없으면 가장 긴 접두 매칭 (gemini-3.1-pro-high가 gemini-3.1-pro보다 우선)
  if (MODEL_TIMEOUTS[m] !== undefined) return MODEL_TIMEOUTS[m];
  const hit = Object.keys(MODEL_TIMEOUTS)
    .filter((key) => m.includes(key))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? MODEL_TIMEOUTS[hit] : 600_000; // 기본 10분
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
