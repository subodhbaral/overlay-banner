import { Rnd } from 'react-rnd';
import type { AdCreative, OverlayConfig } from '../types';

interface Props {
  ad: AdCreative | null;
  overlay: OverlayConfig;
  onChange: (next: Pick<OverlayConfig, 'xPct' | 'yPct' | 'widthPct' | 'heightPct'>) => void;
  disabled?: boolean;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360; // 16:9 mock video frame

/**
 * Sketch canvas representing the live video frame. The selected ad creative
 * is rendered as a draggable/resizable box constrained to the ad's
 * min/max width & height percentages. All positions/sizes are tracked and
 * emitted as percentages of the frame, independent of actual video
 * resolution (the backend converts percentages to per-rendition pixel
 * coordinates at transcode time).
 */
export function OverlayPreviewCanvas({ ad, overlay, onChange, disabled }: Props) {
  const toPx = (pct: number, dim: number) => (pct / 100) * dim;
  const toPct = (px: number, dim: number) => (px / dim) * 100;

  return (
    <div
      style={{
        position: 'relative',
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background:
          'repeating-linear-gradient(45deg, #1b1f27, #1b1f27 10px, #22262f 10px, #22262f 20px)',
        border: '1px solid #333',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontSize: 14,
          pointerEvents: 'none',
        }}
      >
        Live video sketch (16:9)
      </div>

      {ad && (
        <Rnd
          bounds="parent"
          disableDragging={disabled}
          enableResizing={!disabled}
          size={{ width: toPx(overlay.widthPct, CANVAS_WIDTH), height: toPx(overlay.heightPct, CANVAS_HEIGHT) }}
          position={{ x: toPx(overlay.xPct, CANVAS_WIDTH), y: toPx(overlay.yPct, CANVAS_HEIGHT) }}
          minWidth={toPx(ad.minWidthPct, CANVAS_WIDTH)}
          maxWidth={toPx(ad.maxWidthPct, CANVAS_WIDTH)}
          minHeight={toPx(ad.minHeightPct, CANVAS_HEIGHT)}
          maxHeight={toPx(ad.maxHeightPct, CANVAS_HEIGHT)}
          onDragStop={(_e, d) => {
            onChange({
              xPct: clamp(toPct(d.x, CANVAS_WIDTH), 0, 100 - overlay.widthPct),
              yPct: clamp(toPct(d.y, CANVAS_HEIGHT), 0, 100 - overlay.heightPct),
              widthPct: overlay.widthPct,
              heightPct: overlay.heightPct,
            });
          }}
          onResizeStop={(_e, _dir, ref, _delta, pos) => {
            const widthPct = toPct(parseFloat(ref.style.width), CANVAS_WIDTH);
            const heightPct = toPct(parseFloat(ref.style.height), CANVAS_HEIGHT);
            onChange({
              xPct: clamp(toPct(pos.x, CANVAS_WIDTH), 0, 100 - widthPct),
              yPct: clamp(toPct(pos.y, CANVAS_HEIGHT), 0, 100 - heightPct),
              widthPct,
              heightPct,
            });
          }}
        >
          <img
            src={ad.imageUrl}
            alt={ad.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', border: '2px solid #4da3ff' }}
            draggable={false}
          />
        </Rnd>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}
