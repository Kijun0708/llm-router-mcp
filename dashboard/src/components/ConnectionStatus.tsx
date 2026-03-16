import './ConnectionStatus.css';

interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <div className="connection-status">
      <div className={`ws-dot ${connected ? 'connected' : 'disconnected'}`} />
      <span className="ws-label">{connected ? 'Connected' : 'Reconnecting...'}</span>
    </div>
  );
}
