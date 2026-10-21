import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CableEnd, DeviceInstance, Project } from '../core/model';
import { tidyLayout, visibleDevices, type Size } from '../core/layout';
import { getPort, removeCable, removeDevice, updateDevice } from '../core/project';
import { worstSeverity } from '../core/validation';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useGroupIndex, useHighlight } from '../store/highlight';
import { useProjectStore, type Selection } from '../store/projectStore';
import {
  BoardNode,
  DeviceNode,
  ExternalNode,
  parseHandleId,
  proxyHandleId,
  type DiagramNode,
  type ExternalNodeType,
} from './DeviceNode';
import { SEVERITY_ICONS, SIGNAL_COLORS } from './labels';
import { SystemsPanel } from './SystemsPanel';
import { connectPorts } from './connect';
import { isTouchDevice } from './device';

const nodeTypes = { device: DeviceNode, board: BoardNode, external: ExternalNode };

const isBoard = (project: Project, d: DeviceInstance) => project.templates[d.templateId]?.category === 'pedalboard';

/** Where a cable end is drawn at the current level, or null if it is not visible here. */
function endpoint(project: Project, end: CableEnd, visible: Set<string>): { node: string; handle: string } | null {
  if (visible.has(end.deviceId)) return { node: end.deviceId, handle: end.portId };
  const device = project.devices.find((d) => d.id === end.deviceId);
  if (device?.containerId && visible.has(device.containerId)) {
    return { node: device.containerId, handle: proxyHandleId(end.deviceId, end.portId) };
  }
  return null;
}

/** Builds React Flow nodes, keeping React Flow's own data (e.g. measured size). */
function toNodes(project: Project, boardId: string | null, selection: Selection, prev: DiagramNode[]): DiagramNode[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  const devices = visibleDevices(project, boardId);
  const nodes: DiagramNode[] = devices.map((d) => ({
    ...(byId.get(d.id) as DiagramNode | undefined),
    id: d.id,
    type: isBoard(project, d) ? ('board' as const) : ('device' as const),
    position: d.position,
    data: { deviceId: d.id },
    selected: selection?.kind === 'device' && selection.id === d.id,
  })) as DiagramNode[];
  if (!boardId) return nodes;

  // Inside a board: one marker per cable that leaves the board.
  const inside = new Set(devices.map((d) => d.id));
  const minX = Math.min(...devices.map((d) => d.position.x), 0);
  const maxX = Math.max(...devices.map((d) => d.position.x + 260), 260);
  let leftY = 0;
  let rightY = 0;
  for (const cable of project.cables) {
    const [a, b] = cable.ends;
    const aIn = inside.has(a.deviceId);
    const bIn = inside.has(b.deviceId);
    if (aIn === bIn) continue;
    const outer = aIn ? b : a;
    const inner = aIn ? a : b;
    const side: 'left' | 'right' = aIn ? 'right' : 'left';
    const port = getPort(project, outer);
    const innerDevice = devices.find((d) => d.id === inner.deviceId);
    const y = Math.max(innerDevice?.position.y ?? 0, side === 'left' ? leftY : rightY);
    if (side === 'left') leftY = y + 80;
    else rightY = y + 80;
    const title = project.devices.find((d) => d.id === outer.deviceId)?.name ?? '?';
    const subtitle = port?.label ?? '?';
    const ext: ExternalNodeType = {
      id: `ext-${cable.id}`,
      type: 'external',
      position: { x: side === 'left' ? minX - 260 : maxX + 80, y },
      data: { title, subtitle: `${cable.label} · ${subtitle}`, color: port ? SIGNAL_COLORS[port.signal] : '#888', side },
      draggable: false,
      selectable: false,
    };
    nodes.push(ext);
  }
  return nodes;
}

export function GraphView() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const showSignalFlow = useProjectStore((s) => s.showSignalFlow);
  const setShowSignalFlow = useProjectStore((s) => s.setShowSignalFlow);
  const cableStyle = useProjectStore((s) => s.cableStyle);
  const setCableStyle = useProjectStore((s) => s.setCableStyle);
  const dimUnused = useProjectStore((s) => s.dimUnusedPorts);
  const setDimUnused = useProjectStore((s) => s.setDimUnusedPorts);
  const openBoardId = useProjectStore((s) => s.openBoardId);
  const openBoard = useProjectStore((s) => s.openBoard);
  const pending = useProjectStore((s) => s.pendingConnection);
  const startConnection = useProjectStore((s) => s.startConnection);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { byCable } = useAnalysis();
  const highlight = useHighlight();
  const groups = useGroupIndex();
  const flow = useReactFlow();

  const board = project.devices.find((d) => d.id === openBoardId);
  const boardId = board ? board.id : null;

  // React Flow keeps measurement data on its nodes, so we hold them in local
  // state and only write positions back to the project when a drag ends.
  const [nodes, setNodes] = useState<DiagramNode[]>(() => toNodes(project, boardId, selection, []));
  useEffect(() => {
    setNodes((prev) => toNodes(project, boardId, selection, prev));
  }, [project, boardId, selection]);

  // Re-frame the view when entering or leaving a board.
  useEffect(() => {
    const id = setTimeout(() => flow.fitView({ padding: 0.15 }), 60);
    return () => clearTimeout(id);
  }, [boardId, flow]);

  const onNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const edges = useMemo<Edge[]>(() => {
    const visible = new Set(visibleDevices(project, boardId).map((d) => d.id));
    const result: Edge[] = [];
    for (const cable of project.cables) {
      const [from, to] = cable.ends;
      let source = endpoint(project, from, visible);
      let target = endpoint(project, to, visible);
      if (boardId) {
        source ??= { node: `ext-${cable.id}`, handle: 'ext' };
        target ??= { node: `ext-${cable.id}`, handle: 'ext' };
        if (source.node.startsWith('ext-') && target.node.startsWith('ext-')) continue;
      }
      if (!source || !target || source.node === target.node) continue;

      const port = getPort(project, from);
      const color = port ? SIGNAL_COLORS[port.signal] : undefined;
      const severity = worstSeverity(byCable.get(cable.id) ?? []);
      const selected = selection?.kind === 'cable' && selection.id === cable.id;
      const showIcon = severity === 'error' || severity === 'warning';
      const lit = highlight?.cableIds.has(cable.id) ?? false;
      const dimmed = highlight !== undefined && !lit;
      const group = groups.byCable.get(cable.id)?.[0];
      result.push({
        id: cable.id,
        source: source.node,
        sourceHandle: source.handle,
        target: target.node,
        targetHandle: target.handle,
        type: cableStyle === 'orthogonal' ? 'smoothstep' : 'default',
        pathOptions: cableStyle === 'orthogonal' ? { borderRadius: 14, offset: 22 } : undefined,
        selected,
        label: (showIcon ? SEVERITY_ICONS[severity] + ' ' : '') + cable.label,
        labelBgPadding: [7, 3] as [number, number],
        labelBgBorderRadius: 9,
        labelStyle: { fill: '#0e1524', fontWeight: 800, fontSize: 10 },
        labelBgStyle: { fill: color ?? '#888' },
        // Animated dashes show the signal direction along the traced path.
        animated: lit && highlight?.kind === 'trace',
        zIndex: lit ? 1 : 0,
        className: 'cable-edge' + (severity === 'error' ? ' cable-edge--error' : '') + (dimmed ? ' dimmed' : ''),
        style: {
          stroke: color,
          strokeWidth: selected || lit ? 4.5 : 3,
          strokeDasharray:
            port?.signal === 'line-unbal' && !lit ? '7 5' : severity === 'error' && !lit ? '3 4' : undefined,
          filter: group && !dimmed ? `drop-shadow(0 0 4px ${group.color})` : undefined,
        },
        interactionWidth: 28,
      } as Edge);
    }
    return result;
  }, [project, boardId, byCable, selection, highlight, groups, cableStyle]);

  /** "Tidy up": sort the devices of this level by signal flow, then frame them. */
  const tidyUp = () => {
    const sizes = new Map<string, Size>();
    for (const n of flow.getNodes()) {
      if (n.measured?.width && n.measured.height) sizes.set(n.id, { width: n.measured.width, height: n.measured.height });
    }
    apply((p) => tidyLayout(p, boardId, sizes));
    setOptionsOpen(false);
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 400 }), 60);
  };

  const onConnect = useCallback((c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return;
    if (c.source.startsWith('ext-') || c.target.startsWith('ext-')) return;
    connectPorts(parseHandleId(c.source, c.sourceHandle), parseHandleId(c.target, c.targetHandle));
  }, []);

  return (
    <ReactFlow<DiagramNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, __, dragged) =>
        apply((p) =>
          dragged
            .filter((n) => n.type !== 'external')
            .reduce((acc, n) => updateDevice(acc, n.id, { position: n.position }), p),
        )
      }
      onConnect={onConnect}
      onNodeClick={(_, n) => n.type !== 'external' && select({ kind: 'device', id: n.id })}
      onNodeDoubleClick={(_, n) => n.type === 'board' && openBoard(n.id)}
      onEdgeClick={(_, e) => select({ kind: 'cable', id: e.id })}
      onPaneClick={() => select(null)}
      onDelete={({ nodes: delNodes, edges: delEdges }) => {
        apply((p) => {
          let next = delEdges.reduce((acc, e) => removeCable(acc, e.id), p);
          next = delNodes.filter((n) => n.type !== 'external').reduce((acc, n) => removeDevice(acc, n.id), next);
          return next;
        });
        select(null);
      }}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={36}
      deleteKeyCode={['Backspace', 'Delete']}
      minZoom={0.1}
      maxZoom={2.5}
      snapToGrid
      snapGrid={[10, 10]}
      fitView
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="var(--canvas-dot)" />
      <Controls showInteractive={false} showZoom={!isTouchDevice()} />
      {!board && <MiniMap pannable zoomable className="minimap" />}
      <Panel position="top-left">
        <div className="top-left-stack">
          {board && (
            <div className="breadcrumb">
              <button className="breadcrumb__back" onClick={() => openBoard(null)}>
                ← {t('board.back')}
              </button>
              <span className="breadcrumb__here">{board.name}</span>
            </div>
          )}
          <SystemsPanel />
        </div>
      </Panel>
      <Panel position="top-right">
        <div className="view-options-wrap">
          <div className="view-options-bar">
            <button className="tidy-button" onClick={tidyUp} disabled={nodes.length < 2} title={t('view.tidyHint')}>
              <TidyIcon /> {t('view.tidy')}
            </button>
            <button
              className={'view-options-toggle' + (optionsOpen ? ' active' : '')}
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen(!optionsOpen)}
            >
              {t('view.options')}
            </button>
          </div>
          <div className={'view-options' + (optionsOpen ? ' open' : '')}>
            <div className="segmented segmented--small" role="group" aria-label={t('view.cableStyle')}>
              <button className={cableStyle === 'orthogonal' ? 'active' : ''} onClick={() => setCableStyle('orthogonal')}>
                {t('view.cablesOrthogonal')}
              </button>
              <button className={cableStyle === 'curved' ? 'active' : ''} onClick={() => setCableStyle('curved')}>
                {t('view.cablesCurved')}
              </button>
            </div>
            <button
              className={'toggle' + (dimUnused ? ' active' : '')}
              aria-pressed={dimUnused}
              onClick={() => setDimUnused(!dimUnused)}
            >
              {t('view.dimUnused')}
            </button>
            <button
              className={'toggle' + (showSignalFlow ? ' active' : '')}
              aria-pressed={showSignalFlow}
              onClick={() => setShowSignalFlow(!showSignalFlow)}
            >
              〰 {t('flow.toggle')}
            </button>
          </div>
        </div>
      </Panel>
      {pending && (
        <Panel position="bottom-center">
          <div className="connect-banner" role="status">
            <span>{t('connect.pick')}</span>
            <button onClick={() => startConnection(null)}>{t('connect.cancel')}</button>
          </div>
        </Panel>
      )}
    </ReactFlow>
  );
}

/** Three bars lining up: the "tidy up" symbol. */
function TidyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <rect x="1" y="2" width="4" height="4" rx="1" />
      <rect x="1" y="10" width="4" height="4" rx="1" />
      <rect x="11" y="6" width="4" height="4" rx="1" />
      <path d="M5 4h3v8H5M8 8h3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
