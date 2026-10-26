import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, type CSSProperties, type ReactNode } from 'react';
import { isPowerSignal, type Group, type Port } from '../core/model';
import { childrenOf, exposedPorts } from '../core/project';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useGroupIndex, useHighlight, type Highlight } from '../store/highlight';
import { useProjectStore } from '../store/projectStore';
import { CategoryIcon } from './CategoryIcon';
import { ConnectorIcon } from './ConnectorIcon';
import { CATEGORY_PANEL_COLORS, connectorsText, SIGNAL_COLORS } from './labels';
import { connectPorts } from './connect';
import { deleteSelection, setCollapsed } from './actions';
import { NodeControls } from './Controls';
import { DeviceNotes } from './Notes';

/** Devices with more ports than this get the "show only used ports" button. */
const COLLAPSIBLE_FROM = 5;

export type DeviceNodeType = Node<{ deviceId: string }, 'device'>;
export type BoardNodeType = Node<{ deviceId: string }, 'board'>;
export type ExternalNodeType = Node<{ title: string; subtitle: string; color: string; side: 'left' | 'right' }, 'external'>;
export type DiagramNode = DeviceNodeType | BoardNodeType | ExternalNodeType;

/** Handle IDs on a closed pedalboard point at the real port of a pedal on it. */
export const PROXY_PREFIX = 'proxy|';
export const proxyHandleId = (deviceId: string, portId: string) => `${PROXY_PREFIX}${deviceId}|${portId}`;
export function parseHandleId(nodeId: string, handleId: string): { deviceId: string; portId: string } {
  if (!handleId.startsWith(PROXY_PREFIX)) return { deviceId: nodeId, portId: handleId };
  const [deviceId, portId] = handleId.slice(PROXY_PREFIX.length).split('|');
  return { deviceId, portId };
}

const isLeft = (p: Port) => p.direction === 'in';

/** A device block: inputs on the left, outputs (and bidirectional ports) on the right. */
export const DeviceNode = memo(function DeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const device = useProjectStore((s) => s.project.devices.find((d) => d.id === data.deviceId));
  const template = useProjectStore((s) => (device ? s.project.templates[device.templateId] : undefined));
  const ports = usePortState();
  const highlight = useHighlight();
  const groups = useGroupIndex();
  const showControls = useProjectStore((s) => s.showControls);
  if (!device || !template) return null;

  const rows = template.ports
    .filter((p) => ports.showPower || !isPowerSignal(p.signal))
    .map((p) => ({ deviceId: device.id, port: p, handleId: p.id, label: p.label }));
  return (
    <NodeFrame
      deviceId={device.id}
      collapsed={rows.length >= COLLAPSIBLE_FROM ? !!device.collapsed : undefined}
      category={template.category}
      name={device.name}
      model={`${template.manufacturer} ${template.model}`}
      selected={selected}
      highlight={highlight}
      inHighlight={highlight?.deviceIds.has(device.id) ?? false}
      outlined={highlight?.outlinedIds.has(device.id) ?? false}
      groups={groups.byDevice.get(device.id) ?? []}
    >
      {showControls && <NodeControls device={device} template={template} />}
      <PortColumns rows={rows} ports={ports} collapsed={!!device.collapsed} onExpand={() => setCollapsed(device.id, false)} />
    </NodeFrame>
  );
});

/** A closed pedalboard: shows only the ports of its pedals that face outwards. */
export const BoardNode = memo(function BoardNode({ data, selected }: NodeProps<BoardNodeType>) {
  const project = useProjectStore((s) => s.project);
  const openBoard = useProjectStore((s) => s.openBoard);
  const ports = usePortState();
  const highlight = useHighlight();
  const groups = useGroupIndex();
  const device = project.devices.find((d) => d.id === data.deviceId);
  if (!device) return null;
  const children = childrenOf(project, device.id);
  const names = new Map(children.map((c) => [c.id, c.name]));
  const rows = exposedPorts(project, device.id)
    .filter((e) => ports.showPower || !isPowerSignal(e.port.signal))
    .map((e) => ({
    deviceId: e.deviceId,
    port: e.port,
    handleId: proxyHandleId(e.deviceId, e.port.id),
    label: `${names.get(e.deviceId)} · ${e.port.label}`,
  }));
  const inHighlight =
    (highlight?.deviceIds.has(device.id) ?? false) || children.some((c) => highlight?.deviceIds.has(c.id));
  const outlined =
    (highlight?.outlinedIds.has(device.id) ?? false) || children.some((c) => highlight?.outlinedIds.has(c.id));

  return (
    <NodeFrame
      deviceId={device.id}
      collapsed={rows.length >= COLLAPSIBLE_FROM ? !!device.collapsed : undefined}
      category="pedalboard"
      name={device.name}
      model={t('board.pedalCount', { count: children.length })}
      selected={selected}
      highlight={highlight}
      inHighlight={inHighlight}
      outlined={outlined}
      groups={groups.byDevice.get(device.id) ?? []}
      board
      action={
        <button
          className="board-open nodrag"
          onClick={(e) => {
            e.stopPropagation();
            openBoard(device.id);
          }}
        >
          {t('board.open')}
        </button>
      }
    >
      {rows.length > 0 ? (
        <PortColumns rows={rows} ports={ports} collapsed={!!device.collapsed} onExpand={() => setCollapsed(device.id, false)} />
      ) : (
        <div className="board-empty">{t('board.empty')}</div>
      )}
    </NodeFrame>
  );
});

/** Inside an open board: a marker for a device outside the board that a cable leads to. */
export const ExternalNode = memo(function ExternalNode({ data }: NodeProps<ExternalNodeType>) {
  return (
    <div className={`external-node external-node--${data.side}`} style={{ borderColor: data.color }}>
      <Handle
        id="ext"
        type="source"
        isConnectable={false}
        position={data.side === 'left' ? Position.Right : Position.Left}
        className="external-handle"
      />
      <div className="external-node__title">{data.title}</div>
      <div className="external-node__subtitle">{data.subtitle}</div>
    </div>
  );
});

// ---------- Shared parts ----------

function NodeFrame(props: {
  deviceId: string;
  /** undefined: device is too small to collapse. */
  collapsed: boolean | undefined;
  category: Parameters<typeof CategoryIcon>[0]['category'];
  name: string;
  model: string;
  selected: boolean;
  highlight: Highlight | undefined;
  inHighlight: boolean;
  outlined: boolean;
  groups: Group[];
  board?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { highlight, inHighlight, outlined } = props;
  const dimmed = highlight && !inHighlight;
  const style = {
    '--device': CATEGORY_PANEL_COLORS[props.category],
    ...(highlight?.kind === 'group' ? { '--trace': highlight.color } : {}),
  } as CSSProperties;
  return (
    <div
      className={
        'device-node' +
        (props.board ? ' device-node--board' : '') +
        (props.selected ? ' selected' : '') +
        (dimmed ? ' dimmed' : '') +
        (highlight && outlined ? ' in-trace' : '')
      }
      style={style}
    >
      <div className="device-node__header">
        <div className="category-chip">
          <CategoryIcon category={props.category} />
        </div>
        <div className="device-node__titles">
          <div className="device-node__name">{props.name}</div>
          <div className="device-node__model">{props.model}</div>
        </div>
        {props.groups.length > 0 && (
          <div className="group-dots" title={props.groups.map((g) => g.name).join(', ')}>
            {props.groups.map((g) => (
              <span key={g.id} className="group-dot" style={{ background: g.color }} />
            ))}
          </div>
        )}
        {props.action}
        {props.collapsed !== undefined && (
          <button
            className="node-icon-button nodrag"
            title={t(props.collapsed ? 'device.expand' : 'device.collapse')}
            aria-label={t(props.collapsed ? 'device.expand' : 'device.collapse')}
            aria-pressed={props.collapsed}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(props.deviceId, !props.collapsed);
            }}
          >
            <ChevronIcon up={!props.collapsed} />
          </button>
        )}
        {props.selected && (
          <button
            className="node-icon-button node-icon-button--danger nodrag"
            title={t('device.delete')}
            aria-label={t('device.delete')}
            onClick={(e) => {
              e.stopPropagation();
              deleteSelection();
            }}
          >
            <TrashIcon />
          </button>
        )}
      </div>
      {props.children}
      <DeviceNotes deviceId={props.deviceId} />
    </div>
  );
}

interface Row {
  deviceId: string;
  port: Port;
  handleId: string;
  label: string;
}

function usePortState() {
  const { occupancy } = useAnalysis();
  const highlight = useHighlight();
  const groups = useGroupIndex();
  const selection = useProjectStore((s) => s.selection);
  const dimUnused = useProjectStore((s) => s.dimUnusedPorts);
  const select = useProjectStore((s) => s.select);
  const pending = useProjectStore((s) => s.pendingConnection);
  const showPower = useProjectStore((s) => s.showPower);
  return { occupancy, highlight, groups, selection, dimUnused, select, pending, showPower };
}

function PortColumns({
  rows,
  ports,
  collapsed = false,
  onExpand,
}: {
  rows: Row[];
  ports: ReturnType<typeof usePortState>;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const isConnected = (r: Row) => (ports.occupancy.get(`${r.deviceId}/${r.port.id}`) ?? 0) > 0;
  const isActive = (r: Row) =>
    (ports.selection?.kind === 'port' && ports.selection.id === r.deviceId && ports.selection.portId === r.port.id) ||
    (ports.pending?.deviceId === r.deviceId && ports.pending.portId === r.port.id);
  // Collapsed: only ports with a cable (and the one being worked on) stay visible.
  const shown = (r: Row) => !collapsed || isConnected(r) || isActive(r);
  const column = (side: 'left' | 'right') => {
    const all = rows.filter((r) => isLeft(r.port) === (side === 'left'));
    const hidden = all.filter((r) => !shown(r)).length;
    return (
      <>
        {all.filter(shown).map((r) => render(r, side))}
        {hidden > 0 && (
          <button
            className={`port-more port-more--${side} nodrag`}
            onClick={(e) => {
              e.stopPropagation();
              onExpand?.();
            }}
          >
            {t('device.morePorts', { count: hidden })}
          </button>
        )}
      </>
    );
  };
  const render = (r: Row, side: 'left' | 'right') => {
    const key = `${r.deviceId}/${r.port.id}`;
    const connected = isConnected(r);
    return (
      <PortRow
        key={r.handleId}
        row={r}
        side={side}
        connected={connected}
        unused={ports.dimUnused && !connected}
        traced={ports.highlight?.portKeys.has(key) ?? false}
        selected={
          ports.selection?.kind === 'port' && ports.selection.id === r.deviceId && ports.selection.portId === r.port.id
        }
        groups={ports.groups.byPort.get(key) ?? []}
        pendingStart={ports.pending?.deviceId === r.deviceId && ports.pending.portId === r.port.id}
        onSelect={() => {
          const target = { deviceId: r.deviceId, portId: r.port.id };
          // Second tap of tap-to-connect: create the cable.
          if (ports.pending) connectPorts(ports.pending, target);
          else ports.select({ kind: 'port', id: r.deviceId, portId: r.port.id });
        }}
      />
    );
  };
  return (
    <div className="device-node__ports">
      <div className="device-node__col">{column('left')}</div>
      <div className="device-node__col device-node__col--right">{column('right')}</div>
    </div>
  );
}

interface PortRowProps {
  row: Row;
  side: 'left' | 'right';
  connected: boolean;
  unused: boolean;
  traced: boolean;
  selected: boolean;
  groups: Group[];
  pendingStart: boolean;
  onSelect: () => void;
}

function PortRow({ row, side, connected, unused, traced, selected, groups, pendingStart, onSelect }: PortRowProps) {
  const { port } = row;
  const color = SIGNAL_COLORS[port.signal];
  const className =
    `port-row port-row--${side}` +
    (traced ? ' port-row--traced' : '') +
    (selected || pendingStart ? ' port-row--selected' : '') +
    (unused && !pendingStart ? ' port-row--unused' : '');
  return (
    <div
      className={className}
      title={`${t(`signal.${port.signal}`)} · ${connectorsText(port.connectors)}`}
      onClick={(e) => {
        // Tapping the label selects the port (the handle itself is for drawing cables).
        e.stopPropagation();
        onSelect();
      }}
    >
      <Handle
        id={row.handleId}
        type="source"
        position={side === 'left' ? Position.Left : Position.Right}
        className={'port-handle' + (connected ? ' connected' : '')}
        // A jack takes one plug: a port with a cable is no start or end for another one.
        isConnectable={!connected}
        style={{ '--glow': color } as CSSProperties}
      >
        <ConnectorIcon connectors={port.connectors} color={color} />
      </Handle>
      <span className="port-label">
        {port.direction === 'bidi' ? '⇄ ' : ''}
        {row.label}
        {port.channels && port.channels > 1 ? ` (${port.channels}ch)` : ''}
      </span>
      <span className="port-badge" style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
        {t(`signalShort.${port.signal}`)}
      </span>
      {groups.map((g) => (
        <span key={g.id} className="port-group-mark" style={{ background: g.color }} title={g.name} />
      ))}
    </div>
  );
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d={up ? 'M3 9l4-4 4 4' : 'M3 5l4 4 4-4'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 3.5h10M5.5 3.5V2h3v1.5M3.5 3.5l.6 8.5h5.8l.6-8.5M6 6v4M8 6v4" />
    </svg>
  );
}
