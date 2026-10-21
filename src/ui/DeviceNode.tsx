import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, type CSSProperties, type ReactNode } from 'react';
import type { Group, Port } from '../core/model';
import { childrenOf, exposedPorts } from '../core/project';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useGroupIndex, useHighlight, type Highlight } from '../store/highlight';
import { useProjectStore } from '../store/projectStore';
import { CategoryIcon } from './CategoryIcon';
import { ConnectorIcon } from './ConnectorIcon';
import { connectorsText, SIGNAL_COLORS } from './labels';
import { connectPorts } from './connect';

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
  if (!device || !template) return null;

  const rows = template.ports.map((p) => ({ deviceId: device.id, port: p, handleId: p.id, label: p.label }));
  return (
    <NodeFrame
      category={template.category}
      name={device.name}
      model={`${template.manufacturer} ${template.model}`}
      selected={selected}
      highlight={highlight}
      inHighlight={highlight?.deviceIds.has(device.id) ?? false}
      outlined={highlight?.outlinedIds.has(device.id) ?? false}
      groups={groups.byDevice.get(device.id) ?? []}
    >
      <PortColumns rows={rows} ports={ports} />
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
  const rows = exposedPorts(project, device.id).map((e) => ({
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
      {rows.length > 0 ? <PortColumns rows={rows} ports={ports} /> : <div className="board-empty">{t('board.empty')}</div>}
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
  const style = highlight?.kind === 'group' ? ({ '--trace': highlight.color } as CSSProperties) : undefined;
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
      </div>
      {props.children}
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
  return { occupancy, highlight, groups, selection, dimUnused, select, pending };
}

function PortColumns({ rows, ports }: { rows: Row[]; ports: ReturnType<typeof usePortState> }) {
  const render = (r: Row, side: 'left' | 'right') => {
    const key = `${r.deviceId}/${r.port.id}`;
    const connected = (ports.occupancy.get(key) ?? 0) > 0;
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
      <div className="device-node__col">{rows.filter((r) => isLeft(r.port)).map((r) => render(r, 'left'))}</div>
      <div className="device-node__col device-node__col--right">
        {rows.filter((r) => !isLeft(r.port)).map((r) => render(r, 'right'))}
      </div>
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
