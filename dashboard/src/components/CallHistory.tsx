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
              <span className="expert-name">{entry.expertId}</span>
              <span className={`provider-badge ${entry.provider}`}>
                {entry.provider}
              </span>
              <span className="history-duration">
                {formatDuration(entry.durationMs)}
              </span>
              {entry.fromCache && <span className="tag cache-tag">[cached]</span>}
              {entry.usedFallback && (
                <span className="tag fallback-tag">[fallback]</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
