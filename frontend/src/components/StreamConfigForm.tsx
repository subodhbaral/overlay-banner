import type { StreamConfig } from '../types';

interface Props {
  config: StreamConfig;
  onChange: (patch: Partial<StreamConfig>) => void;
  onOverlayFieldChange: (patch: Partial<StreamConfig['overlay']>) => void;
  disabled: boolean;
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: 6,
  borderRadius: 4,
  border: '1px solid #444',
  background: '#111',
  color: '#eee',
};

export function StreamConfigForm({ config, onChange, onOverlayFieldChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <label>
        HLS Input URL {disabled && <span style={{ color: '#888' }}>(editable only while OFF)</span>}
        <input
          style={fieldStyle}
          type="text"
          value={config.hlsInputUrl}
          disabled={disabled}
          onChange={(e) => onChange({ hlsInputUrl: e.target.value })}
          placeholder="https://example.com/live/master.m3u8"
        />
      </label>

      <label>
        Insertion duration (sec)
        <input
          style={fieldStyle}
          type="number"
          min={1}
          value={config.overlay.insertionDurationSec}
          onChange={(e) => onOverlayFieldChange({ insertionDurationSec: Number(e.target.value) })}
        />
      </label>

      <label>
        Transition duration (sec)
        <input
          style={fieldStyle}
          type="number"
          min={0}
          step={0.1}
          value={config.overlay.transitionDurationSec}
          onChange={(e) => onOverlayFieldChange({ transitionDurationSec: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
