import type { ConcurrencyInfo, DashboardState } from '../types';
import './HealthBar.css';

interface Props {
  concurrency: ConcurrencyInfo;
  rateLimits: DashboardState['rateLimits'];
  backgroundTasks: DashboardState['backgroundTasks'];
}

function getLevel(ratio: number): string {
  if (ratio >= 1) return 'danger';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

function ConcurrencyBar({ label, active, limit }: { label: string; active: number; limit: number }) {
  const ratio = limit > 0 ? active / limit : 0;
  const level = getLevel(ratio);
  const pct = Math.min(ratio * 100, 100);

  return (
    <div className="health-item">
      <span className="health-label">{label}</span>
      <div className="health-bar-track">
        <div
          className={`health-bar-fill level-${level}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="health-value">{active}/{limit}</span>
    </div>
  );
}

export function HealthBar({ concurrency, rateLimits, backgroundTasks }: Props) {
  const limitedModels = Object.entries(rateLimits).filter(([, v]) => v.limited);
  const pendingBg = backgroundTasks.pending;

  return (
    <div className="health-bar">
      <ConcurrencyBar label="OpenAI" active={concurrency.openai.active} limit={concurrency.openai.limit} />
      <div className="health-separator" />
      <ConcurrencyBar label="Google" active={concurrency.google.active} limit={concurrency.google.limit} />
      <div className="health-separator" />
      <div className="health-alert">
        <span className="health-label">Rate Limit</span>
        {limitedModels.length > 0 ? (
          <span className="alert-badge danger">{limitedModels.length} BLOCKED</span>
        ) : (
          <span className="alert-badge ok">OK</span>
        )}
      </div>
      <div className="health-separator" />
      <div className="health-alert">
        <span className="health-label">BG Queue</span>
        {pendingBg > 0 ? (
          <span className="alert-badge warn">{pendingBg} PENDING</span>
        ) : (
          <span className="alert-badge ok">OK</span>
        )}
      </div>
    </div>
  );
}
