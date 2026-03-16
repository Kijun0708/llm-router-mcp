import { useState } from 'react';
import type { CallHistoryEntry, ActiveCall, WorkflowInfo } from '../types';
import { formatDuration, formatTime } from '../utils/formatters';
import { SessionBadge } from './SessionBadge';
import './WorkflowTree.css';

interface Props {
  history: CallHistoryEntry[];
  activeCalls: Record<string, ActiveCall>;
  workflows: Record<string, WorkflowInfo>;
}

export function WorkflowTree({ history, activeCalls, workflows }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Separate entries by workflowId
  const grouped: Record<string, CallHistoryEntry[]> = {};
  const ungrouped: CallHistoryEntry[] = [];

  for (const entry of history) {
    if (entry.workflowId) {
      if (!grouped[entry.workflowId]) grouped[entry.workflowId] = [];
      grouped[entry.workflowId].push(entry);
    } else {
      ungrouped.push(entry);
    }
  }

  // Also gather active calls that belong to workflows
  const activeByWorkflow: Record<string, ActiveCall[]> = {};
  for (const call of Object.values(activeCalls)) {
    if (call.workflowId) {
      if (!activeByWorkflow[call.workflowId]) activeByWorkflow[call.workflowId] = [];
      activeByWorkflow[call.workflowId].push(call);
    }
  }

  // Build ordered workflow IDs: workflows with data, sorted by most recent activity
  const workflowIds = new Set<string>([
    ...Object.keys(workflows),
    ...Object.keys(grouped),
    ...Object.keys(activeByWorkflow),
  ]);

  const sortedWorkflowIds = [...workflowIds].sort((a, b) => {
    const wfA = workflows[a];
    const wfB = workflows[b];
    const timeA = wfA?.startedAt || grouped[a]?.[0]?.startedAt || '';
    const timeB = wfB?.startedAt || grouped[b]?.[0]?.startedAt || '';
    return timeB.localeCompare(timeA);
  });

  const toggleCollapse = (wfId: string) => {
    setCollapsed((prev) => ({ ...prev, [wfId]: !prev[wfId] }));
  };

  const computeWorkflowDuration = (wf: WorkflowInfo | undefined, entries: CallHistoryEntry[]): number | null => {
    if (wf?.startedAt && wf?.completedAt) {
      return new Date(wf.completedAt).getTime() - new Date(wf.startedAt).getTime();
    }
    if (entries.length === 0) return null;
    const durations = entries.map((e) => e.durationMs);
    return durations.reduce((a, b) => a + b, 0);
  };

  return (
    <div className="workflow-tree">
      {sortedWorkflowIds.map((wfId) => {
        const wf = workflows[wfId];
        const entries = (grouped[wfId] || []).sort(
          (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        );
        const activeEntries = activeByWorkflow[wfId] || [];
        const isCollapsed = collapsed[wfId] ?? false;
        const status = wf?.status || (activeEntries.length > 0 ? 'running' : 'completed');
        const totalDuration = computeWorkflowDuration(wf, entries);
        const workflowType = wf?.workflowType || 'workflow';
        const sessionId = wf?.sessionId || entries[0]?.sessionId;

        return (
          <div key={wfId} className="workflow-group">
            <div
              className="workflow-header"
              onClick={() => toggleCollapse(wfId)}
            >
              <span className="workflow-expand">
                {isCollapsed ? '\u25B6' : '\u25BC'}
              </span>
              <span className="workflow-type">{workflowType}</span>
              <span className={`workflow-status ${status}`}>
                {status}
              </span>
              {totalDuration !== null && (
                <span className="workflow-duration">
                  {formatDuration(totalDuration)}
                </span>
              )}
              <span className="workflow-count">
                {entries.length + activeEntries.length}
              </span>
              {sessionId && <SessionBadge sessionId={sessionId} />}
            </div>
            {!isCollapsed && (
              <div className="workflow-children">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`workflow-child ${entry.success ? '' : 'error'}`}
                  >
                    <span className="tree-connector" />
                    {entry.callPhase && (
                      <span className="phase-label">{entry.callPhase}</span>
                    )}
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
                {activeEntries.map((call) => (
                  <div key={call.id} className="workflow-child active-child">
                    <span className="tree-connector" />
                    {call.callPhase && (
                      <span className="phase-label">{call.callPhase}</span>
                    )}
                    <span className="status-dot active" />
                    <span className="expert-name">{call.expertId}</span>
                    <span className={`provider-badge ${call.provider}`}>
                      {call.provider}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped entries as flat list */}
      {ungrouped.map((entry) => (
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
          {entry.sessionId && <SessionBadge sessionId={entry.sessionId} />}
        </div>
      ))}
    </div>
  );
}
