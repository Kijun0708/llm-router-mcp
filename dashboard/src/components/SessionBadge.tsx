import './SessionBadge.css';

interface Props {
  sessionId: string;
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 45%)`;
}

export function SessionBadge({ sessionId }: Props) {
  const short = sessionId.slice(-6);
  const color = hashColor(sessionId);

  return (
    <span className="session-badge" style={{ background: color }}>
      {short}
    </span>
  );
}
