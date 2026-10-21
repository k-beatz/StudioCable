import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { Port } from '../core/model';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { connectorsText, SIGNAL_COLORS } from './labels';

export type DeviceNodeType = Node<{ deviceId: string }, 'device'>;

/** A device block: inputs on the left, outputs (and bidirectional ports) on the right. */
export const DeviceNode = memo(function DeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const device = useProjectStore((s) => s.project.devices.find((d) => d.id === data.deviceId));
  const template = useProjectStore((s) => (device ? s.project.templates[device.templateId] : undefined));
  const { occupancy } = useAnalysis();
  if (!device || !template) return null;

  const inputs = template.ports.filter((p) => p.direction === 'in');
  const outputs = template.ports.filter((p) => p.direction !== 'in');
  const isConnected = (p: Port) => (occupancy.get(`${device.id}/${p.id}`) ?? 0) > 0;

  return (
    <div className={'device-node' + (selected ? ' selected' : '')}>
      <div className="device-node__header">
        <div className="device-node__name">{device.name}</div>
        <div className="device-node__model">
          {template.manufacturer} {template.model}
        </div>
      </div>
      <div className="device-node__ports">
        <div className="device-node__col">
          {inputs.map((p) => (
            <PortRow key={p.id} port={p} side="left" connected={isConnected(p)} />
          ))}
        </div>
        <div className="device-node__col device-node__col--right">
          {outputs.map((p) => (
            <PortRow key={p.id} port={p} side="right" connected={isConnected(p)} />
          ))}
        </div>
      </div>
    </div>
  );
});

function PortRow({ port, side, connected }: { port: Port; side: 'left' | 'right'; connected: boolean }) {
  const color = SIGNAL_COLORS[port.signal];
  return (
    <div className={`port-row port-row--${side}`} title={`${t(`signal.${port.signal}`)} · ${connectorsText(port.connectors)}`}>
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
