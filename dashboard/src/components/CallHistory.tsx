import { useState } from 'react';
import type { CallHistoryEntry, ActiveCall, WorkflowInfo } from '../types';
import { formatDuration, formatTime } from '../utils/formatters';
import { WorkflowTree } from './WorkflowTree';
import './CallHistory.css';

interface Props {
  history: CallHistoryEntry[];
  activeCalls: Record<string, ActiveCall>;
  workflows: Record<string, WorkflowInfo>;
}

type ViewMode = 'flat' | 'tree';

function getLatencyLevel(ms: number): string {
  if (ms >= 120000) return 'slow';   // 2min+
  if (ms >= 30000) return 'medium';  // 30s+
  return 'fast';
}

function formatBytes(chars: number): string {
  const kb = chars / 1024;
  if (kb >= 1) return `${kb.toFixed(1)}KB`;
  return `${chars}B`;
}

export function CallHistory({ history, activeCalls, workflows }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const items = history.slice(0, 50);

  return (
    <div className="panel history-panel">
      <div className="history-header">
        <h2 className="panel-title">CALL HISTORY</h2>
        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'flat' ? 'active' : ''}`}
            onClick={() => setViewMode('flat')}
          >
            FLAT
          </button>
          <button
            className={`toggle-btn ${viewMode === 'tree' ? 'active' : ''}`}
            onClick={() => setViewMode('tree')}
          >
            TREE
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">호출 기록 없음</div>
      ) : viewMode === 'tree' ? (
        <WorkflowTree
          history={items}
          activeCalls={activeCalls}
          workflows={workflows}
        />
      ) : (
        <div className="history-list">
          {items.map((entry) => (
            <div
              key={entry.id}
              className={`history-item ${entry.success ? '' : 'error'}`}
            >
              <span className="history-time">
                {formatTime(entry.completedAt || entry.startedAt)}
              </span>
              {entry.usedFallback && entry.originalExpert ? (
                <span className="fallback-chain">
                  <span className="original-expert">{entry.originalExpert}</span>
                  <span className="fallback-arrow">&rarr;</span>
                  <span className="expert-name">{entry.expertId}</span>
                </span>
              ) : (
                <span className="expert-name">{entry.expertId}</span>
              )}
              <span className={`provider-badge ${entry.provider}`}>
                {entry.provider}
              </span>
              <span className={`latency-badge latency-${getLatencyLevel(entry.durationMs)}`}>
                {formatDuration(entry.durationMs)}
              </span>
              {entry.responseLength > 0 && (
                <span className="response-size">{formatBytes(entry.responseLength)}</span>
              )}
              {entry.fromCache && <span className="tag cache-tag">[cached]</span>}
              {entry.usedFallback && (
                <span className="tag fallback-tag">[fallback]</span>
              )}
              {!entry.success && entry.errorMessage && (
                <span className="error-msg" title={entry.errorMessage}>
                  {entry.errorMessage.slice(0, 40)}{entry.errorMessage.length > 40 ? '...' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
