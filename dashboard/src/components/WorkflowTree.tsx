import { useState, useRef, useEffect } from 'react';
import type { CallHistoryEntry, ActiveCall, WorkflowInfo } from '../types';
import { formatDuration, formatTime } from '../utils/formatters';
import { SessionBadge } from './SessionBadge';
import './WorkflowTree.css';

interface Props {
  history: CallHistoryEntry[];
  activeCalls: Record<string, ActiveCall>;
  workflows: Record<string, WorkflowInfo>;
}

function getLatencyLevel(ms: number): string {
  if (ms >= 120000) return 'slow';
  if (ms >= 30000) return 'medium';
  return 'fast';
}

export function WorkflowTree({ history, activeCalls, workflows }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const userToggledRef = useRef<Set<string>>(new Set());

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

  // Build ordered workflow IDs
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

  // Auto-expand workflows with errors (unless user manually collapsed)
  useEffect(() => {
    const updates: Record<string, boolean> = {};
    for (const wfId of sortedWorkflowIds) {
      if (userToggledRef.current.has(wfId)) continue;
      const wf = workflows[wfId];
      const entries = grouped[wfId] || [];
      const hasError = wf?.status === 'failed' || entries.some(e => !e.success);
      if (hasError) {
        updates[wfId] = false; // force expand
      }
    }
    if (Object.keys(updates).length > 0) {
      setCollapsed(prev => ({ ...prev, ...updates }));
    }
  }, [workflows, history]);

  const toggleCollapse = (wfId: string) => {
    userToggledRef.current.add(wfId);
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
        const hasError = status === 'failed' || entries.some(e => !e.success);

        // Timeline calculation
        const wfStartMs = wf?.startedAt ? new Date(wf.startedAt).getTime() : (entries[0] ? new Date(entries[0].startedAt).getTime() : 0);
        const wfEndMs = wf?.completedAt ? new Date(wf.completedAt).getTime() : Date.now();
        const wfDurationMs = wfEndMs - wfStartMs;

        return (
          <div key={wfId} className={`workflow-group ${hasError ? 'workflow-group--error' : ''}`}>
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
                <span className={`workflow-duration latency-${getLatencyLevel(totalDuration)}`}>
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
                {entries.map((entry) => {
                  const entryStartMs = new Date(entry.startedAt).getTime();
                  const relLeft = wfDurationMs > 0 ? ((entryStartMs - wfStartMs) / wfDurationMs) * 100 : 0;
                  const relWidth = wfDurationMs > 0 ? (entry.durationMs / wfDurationMs) * 100 : 0;

                  return (
                    <div
                      key={entry.id}
                      className={`workflow-child ${entry.success ? '' : 'error'}`}
                      style={{
                        '--timeline-left': `${Math.max(0, Math.min(relLeft, 100))}%`,
                        '--timeline-width': `${Math.max(0, Math.min(relWidth, 100 - relLeft))}%`,
                      } as React.CSSProperties}
                    >
                      <span className="tree-connector" />
                      {entry.callPhase && (
                        <span className="phase-label">{entry.callPhase}</span>
                      )}
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
                      {entry.fromCache && <span className="tag cache-tag">[cached]</span>}
                      {entry.usedFallback && (
                        <span className="tag fallback-tag">[fallback]</span>
                      )}
                      {!entry.success && entry.errorMessage && (
                        <span className="error-msg" title={entry.errorMessage}>
                          {entry.errorMessage.slice(0, 30)}...
                        </span>
                      )}
                    </div>
                  );
                })}
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
