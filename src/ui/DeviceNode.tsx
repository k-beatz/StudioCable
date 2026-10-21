import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { Port } from '../core/model';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { useTrace } from '../store/trace';
import { connectorsText, SIGNAL_COLORS } from './labels';

export type DeviceNodeType = Node<{ deviceId: string }, 'device'>;

/** A device block: inputs on the left, outputs (and bidirectional ports) on the right. */
export const DeviceNode = memo(function DeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const device = useProjectStore((s) => s.project.devices.find((d) => d.id === data.deviceId));
  const template = useProjectStore((s) => (device ? s.project.templates[device.templateId] : undefined));
  const { occupancy } = useAnalysis();
  const trace = useTrace();
  const selection = useProjectStore((s) => s.selection);
  const select = useProjectStore((s) => s.select);
  if (!device || !template) return null;

  const inputs = template.ports.filter((p) => p.direction === 'in');
  const outputs = template.ports.filter((p) => p.direction !== 'in');
  const isConnected = (p: Port) => (occupancy.get(`${device.id}/${p.id}`) ?? 0) > 0;
  const rowProps = (p: Port) => ({
    port: p,
    connected: isConnected(p),
    traced: trace?.portKeys.has(`${device.id}/${p.id}`) ?? false,
    selected: selection?.kind === 'port' && selection.id === device.id && selection.portId === p.id,
    onSelect: () => select({ kind: 'port', id: device.id, portId: p.id }),
  });
  const dimmed = trace && !trace.deviceIds.has(device.id);

  return (
    <div className={'device-node' + (selected ? ' selected' : '') + (dimmed ? ' dimmed' : '')}>
      <div className="device-node__header">
        <div className="device-node__name">{device.name}</div>
        <div className="device-node__model">
          {template.manufacturer} {template.model}
        </div>
      </div>
      <div className="device-node__ports">
        <div className="device-node__col">
          {inputs.map((p) => (
            <PortRow key={p.id} side="left" {...rowProps(p)} />
          ))}
        </div>
        <div className="device-node__col device-node__col--right">
          {outputs.map((p) => (
            <PortRow key={p.id} side="right" {...rowProps(p)} />
          ))}
        </div>
      </div>
    </div>
  );
});

interface PortRowProps {
  port: Port;
  side: 'left' | 'right';
  connected: boolean;
  traced: boolean;
  selected: boolean;
  onSelect: () => void;
}

function PortRow({ port, side, connected, traced, selected, onSelect }: PortRowProps) {
  const color = SIGNAL_COLORS[port.signal];
  const className =
    `port-row port-row--${side}` + (traced ? ' port-row--traced' : '') + (selected ? ' port-row--selected' : '');
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
        id={port.id}
        type="source"
        position={side === 'left' ? Position.Left : Position.Right}
        className={'port-handle' + (connected ? ' connected' : '')}
        style={{ borderColor: color, background: connected ? color : undefined }}
      />
      <span className="port-badge" style={{ background: color }}>
        {t(`signalShort.${port.signal}`)}
      </span>
      <span className="port-label">
        {port.direction === 'bidi' ? '⇄ ' : ''}
        {port.label}
        {port.channels && port.channels > 1 ? ` (${port.channels}ch)` : ''}
      </span>
    </div>
  );
}
