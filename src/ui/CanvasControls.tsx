import { MiniMap, Panel, useReactFlow, type Node } from '@xyflow/react';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';
import { isTouchDevice } from './device';
import { CATEGORY_PANEL_COLORS } from './labels';

/**
 * StudioCable's own zoom buttons and overview, replacing React Flow's
 * standard controls and minimap.
 */
export function CanvasControls({ showOverviewButton }: { showOverviewButton: boolean }) {
  const flow = useReactFlow();
  const overview = useProjectStore((s) => s.showOverview);
  const setOverview = useProjectStore((s) => s.setShowOverview);
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
      {showOverviewButton && (
        <button
          className={overview ? 'active' : ''}
          aria-pressed={overview}
          onClick={() => setOverview(!overview)}
          aria-label={t('canvas.overview')}
          title={t('canvas.overview')}
        >
          <Icon d="M2 3.5h12v9H2zM5 6.5h3v3H5z" />
        </button>
      )}
    </Panel>
  );
}

/** Small "screen" showing the whole setup, devices in their panel colours. */
export function Overview() {
  const project = useProjectStore((s) => s.project);
  const color = (n: Node) => {
    if (n.type === 'external') return '#5f6670';
    const d = project.devices.find((x) => x.id === n.id);
    const category = d ? project.templates[d.templateId]?.category : undefined;
    return category ? CATEGORY_PANEL_COLORS[category] : '#5f6670';
  };
  return (
    <MiniMap
      className="overview"
      position="bottom-right"
      pannable
      zoomable
      nodeColor={color}
      nodeStrokeWidth={0}
      nodeBorderRadius={4}
      ariaLabel={t('canvas.overview')}
    />
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
