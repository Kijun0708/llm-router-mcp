import type { SessionInfo } from '../types';
import './SessionFilter.css';

interface Props {
  sessions: Record<string, SessionInfo>;
  selected: string | null;
  onSelect: (sessionId: string | null) => void;
}

export function SessionFilter({ sessions, selected, onSelect }: Props) {
  const entries = Object.values(sessions).sort(
    (a, b) => b.totalCalls - a.totalCalls
  );

  return (
    <div className="session-filter">
      <span className="session-filter-label">Session</span>
      <select
        className="session-select"
        value={selected ?? '__all__'}
        onChange={(e) => onSelect(e.target.value === '__all__' ? null : e.target.value)}
      >
        <option value="__all__">All Sessions ({entries.length})</option>
        {entries.map((s) => {
          const shortId = s.sessionId.slice(-6);
          return (
            <option key={s.sessionId} value={s.sessionId}>
              {shortId} ({s.totalCalls} calls)
            </option>
          );
        })}
      </select>
    </div>
  );
}
