import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  useReactFlow,
  useStore,
  type Connection,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CableEnd, DeviceInstance, Project } from '../core/model';
import { tidyLayout, visibleDevices, type Size } from '../core/layout';
import { connectChain, suggestWiring } from '../core/autowire';
import { isPowerCable, isPowerDevice } from '../core/power';
import { findCrossings, routeCables, type CableEnds, type Point, type Rect } from '../core/routing';
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
import { RoutedEdge, type RoutedEdgeType } from './RoutedEdge';
import { HangingEdge } from './HangingEdge';
import { ChainOverlay } from './ChainOverlay';
import { CanvasControls, Overview } from './CanvasControls';

const nodeTypes = { device: DeviceNode, board: BoardNode, external: ExternalNode };
const edgeTypes = { routed: RoutedEdge, hanging: HangingEdge };

/** A short text that changes whenever a node moves, resizes or gains/loses handles. */
function layoutKeyOf(s: { nodeLookup: Map<string, { id: string; measured: { width?: number; height?: number }; internals: { positionAbsolute: { x: number; y: number }; handleBounds?: { source?: unknown[] | null } } }> }) {
  let key = '';
  for (const n of s.nodeLookup.values()) {
    const p = n.internals.positionAbsolute;
    key += `${n.id}:${Math.round(p.x)},${Math.round(p.y)},${n.measured.width},${n.measured.height},${n.internals.handleBounds?.source?.length ?? 0};`;
  }
  return key;
}

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
/** Devices drawn at this level; power-only devices only when the power layer is on. */
function shownDevices(project: Project, boardId: string | null, showPower: boolean) {
  const devices = visibleDevices(project, boardId);
  return showPower ? devices : devices.filter((d) => !isPowerDevice(project, d));
}

function toNodes(
  project: Project,
  boardId: string | null,
  selection: Selection,
  prev: DiagramNode[],
  showPower: boolean,
): DiagramNode[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  const devices = shownDevices(project, boardId, showPower);
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
    if (!showPower && isPowerCable(project, cable)) continue;
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
  const [chainMode, setChainMode] = useState(false);
  /** Cables just added by "suggest wiring" or the chain tool, highlighted until kept or removed. */
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const { byCable } = useAnalysis();
  const highlight = useHighlight();
  const groups = useGroupIndex();
  const flow = useReactFlow();

  const board = project.devices.find((d) => d.id === openBoardId);
  const boardId = board ? board.id : null;

  // React Flow keeps measurement data on its nodes, so we hold them in local
  // state and only write positions back to the project when a drag ends.
  const showPower = useProjectStore((s) => s.showPower);
  const setShowPower = useProjectStore((s) => s.setShowPower);
  const look = useProjectStore((s) => s.look);
  const showOverview = useProjectStore((s) => s.showOverview);
  const setLook = useProjectStore((s) => s.setLook);
  const [nodes, setNodes] = useState<DiagramNode[]>(() => toNodes(project, boardId, selection, [], showPower));
  useEffect(() => {
    setNodes((prev) => toNodes(project, boardId, selection, prev, showPower));
  }, [project, boardId, selection, showPower]);

  // Re-frame the view when entering or leaving a board.
  useEffect(() => {
    const id = setTimeout(() => flow.fitView({ padding: 0.15 }), 60);
    return () => clearTimeout(id);
  }, [boardId, flow]);

  const onNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const baseEdges = useMemo<RoutedEdgeType[]>(() => {
    const visible = new Set(shownDevices(project, boardId, showPower).map((d) => d.id));
    const result: RoutedEdgeType[] = [];
    for (const cable of project.cables) {
      if (!showPower && isPowerCable(project, cable)) continue;
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
        type: cableStyle === 'hanging' ? 'hanging' : 'routed',
        data: { curved: cableStyle === 'curved' },
        selected,
        label: (showIcon ? SEVERITY_ICONS[severity] + ' ' : '') + cable.label,
        labelBgPadding: [7, 3] as [number, number],
        labelBgBorderRadius: 9,
        labelStyle: { fill: '#0e1524', fontWeight: 800, fontSize: 10 },
        labelBgStyle: { fill: color ?? '#888' },
        // Animated dashes show the signal direction along the traced path.
        animated: lit && highlight?.kind === 'trace',
        zIndex: lit ? 1 : 0,
        className:
          'cable-edge' +
          (severity === 'error' ? ' cable-edge--error' : '') +
          (dimmed ? ' dimmed' : '') +
          (suggested?.includes(cable.id) ? ' cable-edge--suggested' : ''),
        style: {
          stroke: color,
          strokeWidth: selected || lit ? 4.5 : 3,
          strokeDasharray:
            port?.signal === 'line-unbal' && !lit ? '7 5' : severity === 'error' && !lit ? '3 4' : undefined,
          filter: group && !dimmed ? `drop-shadow(0 0 4px ${group.color})` : undefined,
        },
        interactionWidth: 28,
      });
    }
    return result;
  }, [project, boardId, byCable, selection, highlight, groups, cableStyle, showPower, suggested]);

  /** "Tidy up": sort the devices of this level by signal flow, then frame them. */
  // "Draw chain" tool and "Suggest wiring".
  const setNotice = useProjectStore((s) => s.setNotice);
  const nameOf = (id: string) => project.devices.find((d) => d.id === id)?.name ?? '?';

  const finishChain = (deviceIds: string[]) => {
    setChainMode(false);
    if (deviceIds.length < 2) {
      setNotice(t('tool.chainTooShort'));
      return;
    }
    const result = connectChain(project, deviceIds);
    if (result.added.length) apply(() => result.project);
    const first = result.failed[0];
    setNotice(
      [
        result.added.length ? t('tool.chainDone', { count: result.added.length }) : '',
        first ? t('tool.chainFailed', { a: nameOf(first[0]), b: nameOf(first[1]) }) : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  };

  const suggest = () => {
    setOptionsOpen(false);
    const ids = shownDevices(project, boardId, showPower).map((d) => d.id);
    const result = suggestWiring(project, ids);
    if (!result.added.length) {
      setNotice(t('tool.suggestedNone'));
      return;
    }
    apply(() => result.project);
    setSuggested(result.added);
  };

  // Forget the highlight once those cables are gone (e.g. after undo).
  useEffect(() => {
    if (suggested && !suggested.some((id) => project.cables.some((c) => c.id === id))) setSuggested(null);
  }, [project, suggested]);

  const removeSuggested = () => {
    const ids = suggested ?? [];
    apply((p) => ids.reduce((acc, id) => removeCable(acc, id), p));
    setSuggested(null);
  };

  const tidyUp = () => {
    const sizes = new Map<string, Size>();
    for (const n of flow.getNodes()) {
      if (n.measured?.width && n.measured.height) sizes.set(n.id, { width: n.measured.width, height: n.measured.height });
    }
    apply((p) => tidyLayout(p, boardId, sizes));
    setOptionsOpen(false);
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 400 }), 60);
  };

  // Cable routing runs for the whole diagram at once (so cables can avoid devices
  // and each other). It is paused while a device is being dragged and redone on drop.
  const [dragging, setDragging] = useState(false);
  const layoutKey = useStore(layoutKeyOf);
  const lastRouting = useRef<{ routes: Map<string, Point[]>; bridges: Map<string, Point[]> }>({
    routes: new Map(),
    bridges: new Map(),
  });
  const routing = useMemo(() => {
    // Hanging cables are drawn freely on top; no routing needed.
    if (cableStyle === 'hanging') return { routes: new Map<string, Point[]>(), bridges: new Map<string, Point[]>() };
    if (dragging) return lastRouting.current;
    const rects: Rect[] = [];
    const handles = new Map<string, Map<string, { point: Point; side: 'left' | 'right' }>>();
    for (const n of nodes) {
      const internal = flow.getInternalNode(n.id);
      const w = internal?.measured.width;
      const h = internal?.measured.height;
      if (!internal || !w || !h) continue;
      const pos = internal.internals.positionAbsolute;
      rects.push({ id: n.id, x: pos.x, y: pos.y, width: w, height: h });
      const byId = new Map<string, { point: Point; side: 'left' | 'right' }>();
      for (const hb of internal.internals.handleBounds?.source ?? []) {
        const left = hb.position === 'left';
        byId.set(hb.id ?? '', {
          point: { x: pos.x + hb.x + (left ? 0 : hb.width), y: pos.y + hb.y + hb.height / 2 },
          side: left ? 'left' : 'right',
        });
      }
      handles.set(n.id, byId);
    }
    const cables: CableEnds[] = [];
    for (const e of baseEdges) {
      const s = handles.get(e.source)?.get(e.sourceHandle ?? '');
      const t = handles.get(e.target)?.get(e.targetHandle ?? '');
      if (!s || !t) continue;
      cables.push({
        id: e.id,
        source: s.point,
        target: t.point,
        sourceSide: s.side,
        targetSide: t.side,
        sourceNode: e.source,
        targetNode: e.target,
      });
    }
    const routes = routeCables(rects, cables);
    const result = { routes, bridges: findCrossings(routes) };
    lastRouting.current = result;
    return result;
    // layoutKey stands for the node positions and sizes read through `flow`.
  }, [layoutKey, baseEdges, dragging, flow, cableStyle]);

  const edges = useMemo(
    () =>
      baseEdges.map((e) => ({
        ...e,
        data: { curved: e.data?.curved ?? false, points: routing.routes.get(e.id), bridges: routing.bridges.get(e.id) },
        // Cables that jump over others are drawn on top, so the bridge (and its gap) is visible.
        // Hanging cables lie on top of the devices; others underneath (bridging ones above their neighbours).
        zIndex: cableStyle === 'hanging' ? 1000 + (e.zIndex ?? 0) : (e.zIndex ?? 0) * 2 + (routing.bridges.has(e.id) ? 1 : 0),
      })),
    [baseEdges, routing, cableStyle],
  );

  const onConnect = useCallback((c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return;
    if (c.source.startsWith('ext-') || c.target.startsWith('ext-')) return;
    connectPorts(parseHandleId(c.source, c.sourceHandle), parseHandleId(c.target, c.targetHandle));
  }, []);

  return (
    <ReactFlow<DiagramNode, RoutedEdgeType>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStart={() => setDragging(true)}
      onNodeDragStop={(_, __, dragged) => {
        setDragging(false);
        apply((p) =>
          dragged
            .filter((n) => n.type !== 'external')
            .reduce((acc, n) => updateDevice(acc, n.id, { position: n.position }), p),
        );
      }}
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
      proOptions={{ hideAttribution: true }}
    >
      {look === 'modular' ? (
        // Faint seams between metal panels instead of the usual dot grid.
        <Background variant={BackgroundVariant.Lines} gap={192} lineWidth={1} color="var(--canvas-seam)" />
      ) : (
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="var(--canvas-dot)" />
      )}
      <CanvasControls showOverviewButton={!board} />
      {!board && showOverview && <Overview />}
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
            <button
              className="tool-button"
              onClick={tidyUp}
              disabled={nodes.length < 2}
              title={t('view.tidyHint')}
              aria-label={t('view.tidy')}
            >
              <TidyIcon />
              <span className="tool-label">{t('view.tidy')}</span>
            </button>
            <button
              className={'tool-button' + (chainMode ? ' active' : '')}
              onClick={() => {
                setOptionsOpen(false);
                select(null);
                setChainMode(!chainMode);
              }}
              disabled={nodes.length < 2}
              aria-pressed={chainMode}
              title={t('tool.chainHint')}
              aria-label={t('tool.chain')}
            >
              <ChainIcon />
              <span className="tool-label">{t('tool.chain')}</span>
            </button>
            <button
              className="tool-button"
              onClick={suggest}
              disabled={nodes.length < 2}
              title={t('tool.suggestHint')}
              aria-label={t('tool.suggest')}
            >
              <SuggestIcon />
              <span className="tool-label">{t('tool.suggest')}</span>
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
            <div className="segmented segmented--small" role="group" aria-label={t('view.look')}>
              <button className={look === 'modular' ? 'active' : ''} onClick={() => setLook('modular')}>
                {t('view.lookModular')}
              </button>
              <button className={look === 'clean' ? 'active' : ''} onClick={() => setLook('clean')}>
                {t('view.lookClean')}
              </button>
            </div>
            <div className="segmented segmented--small" role="group" aria-label={t('view.cableStyle')}>
              <button className={cableStyle === 'orthogonal' ? 'active' : ''} onClick={() => setCableStyle('orthogonal')}>
                {t('view.cablesOrthogonal')}
              </button>
              <button className={cableStyle === 'curved' ? 'active' : ''} onClick={() => setCableStyle('curved')}>
                {t('view.cablesCurved')}
              </button>
              <button className={cableStyle === 'hanging' ? 'active' : ''} onClick={() => setCableStyle('hanging')}>
                {t('view.cablesHanging')}
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
              className={'toggle' + (showPower ? ' active' : '')}
              aria-pressed={showPower}
              onClick={() => setShowPower(!showPower)}
            >
              ⚡ {t('view.power')}
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
      {chainMode && <ChainOverlay onFinish={finishChain} />}
      {chainMode && (
        <Panel position="bottom-center">
          <div className="connect-banner" role="status">
            <span>{t('tool.chainHint')}</span>
            <button onClick={() => setChainMode(false)}>{t('tool.cancel')}</button>
          </div>
        </Panel>
      )}
      {suggested && !chainMode && (
        <Panel position="bottom-center">
          <div className="connect-banner connect-banner--suggest" role="status">
            <span>{t('tool.suggested', { count: suggested.length })}</span>
            <button onClick={() => setSuggested(null)}>{t('tool.keep')}</button>
            <button onClick={removeSuggested}>{t('tool.remove')}</button>
          </div>
        </Panel>
      )}
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

/** A line through three dots: the "draw chain" tool. */
function ChainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 12.5C5 4 8 13 10 7s2.5-3 3.5-4" />
      <circle cx="2.5" cy="12.5" r="1.6" fill="currentColor" />
      <circle cx="8" cy="9.5" r="1.6" fill="currentColor" />
      <circle cx="13.5" cy="3" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** A magic wand: "suggest wiring". */
function SuggestIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 13.5l8-8M9 4l3 3" />
      <path d="M12.5 1.5v2M11.5 2.5h2M14 9v2M13 10h2M5.5 1.5v2M4.5 2.5h2" />
    </svg>
  );
}
