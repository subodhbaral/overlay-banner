import type { StreamStatusResponse } from '../types';

interface Props {
  status: StreamStatusResponse | null;
  onToggle: () => void;
  busy: boolean;
}

export function StreamToggle({ status, onToggle, busy }: Props) {
  const isOn = status?.status === 'ON';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={onToggle}
        disabled={busy}
        style={{
          padding: '8px 20px',
          borderRadius: 6,
          border: 'none',
          background: isOn ? '#e74c3c' : '#2ecc71',
          color: '#111',
          fontWeight: 700,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {isOn ? 'Turn OFF' : 'Turn ON'}
      </button>
      <div style={{ fontSize: 13, color: '#aaa' }}>
        Status: <strong style={{ color: isOn ? '#2ecc71' : '#e74c3c' }}>{status?.status ?? 'UNKNOWN'}</strong>
        {isOn && (
          <>
            {' '}· profiles: {status?.profileCount ?? 0}
            {status?.lastError && <span style={{ color: '#e74c3c' }}> · error: {status.lastError}</span>}
          </>
        )}
      </div>
    </div>
  );
}
