import './RateLimits.css';

interface Props {
  limits: Record<string, { limited: boolean; retryInMs?: number }>;
}

export function RateLimits({ limits }: Props) {
  const entries = Object.entries(limits);

  return (
    <div className="panel">
      <h2 className="panel-title">RATE LIMITS</h2>
      {entries.length === 0 ? (
        <div className="empty-state">제한 없음</div>
      ) : (
        <div className="rl-list">
          {entries.map(([model, status]) => (
            <div key={model} className={`rl-item ${status.limited ? 'limited' : 'ok'}`}>
              <span className="rl-model">{model}</span>
              <span className="rl-status">{status.limited ? 'BLOCKED' : 'OK'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
