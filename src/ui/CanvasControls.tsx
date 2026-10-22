import { Panel, useReactFlow } from '@xyflow/react';
import { t } from '../i18n';
import { isTouchDevice } from './device';

/** StudioCable's own zoom buttons, replacing React Flow's standard controls. */
export function CanvasControls() {
  const flow = useReactFlow();
  const touch = isTouchDevice();
  return (
    <Panel position="bottom-left" className="canvas-controls">
      {/* Pinch-zoom does the job on touch screens. */}
      {!touch && (
        <>
          <button onClick={() => flow.zoomIn({ duration: 200 })} aria-label={t('canvas.zoomIn')} title={t('canvas.zoomIn')}>
            <Icon d="M8 3v10M3 8h10" />
          </button>
          <button onClick={() => flow.zoomOut({ duration: 200 })} aria-label={t('canvas.zoomOut')} title={t('canvas.zoomOut')}>
            <Icon d="M3 8h10" />
          </button>
        </>
      )}
      <button onClick={() => flow.fitView({ padding: 0.15, duration: 300 })} aria-label={t('canvas.fit')} title={t('canvas.fit')}>
        <Icon d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
      </button>
    </Panel>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
