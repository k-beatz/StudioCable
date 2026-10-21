import {
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addCable, getPort, removeCable, removeDevice, updateDevice } from '../core/project';
import type { DeviceInstance } from '../core/model';
import { worstSeverity } from '../core/validation';
import { useAnalysis } from '../store/analysis';
import { useProjectStore, type Selection } from '../store/projectStore';
import { DeviceNode, type DeviceNodeType } from './DeviceNode';
import { SEVERITY_ICONS, SIGNAL_COLORS } from './labels';

const nodeTypes = { device: DeviceNode };

/** Builds React Flow nodes from devices, keeping React Flow's own data (e.g. measured size). */
function toNodes(devices: DeviceInstance[], selection: Selection, prev: DeviceNodeType[]): DeviceNodeType[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  return devices.map((d) => ({
    ...byId.get(d.id),
    id: d.id,
    type: 'device' as const,
    position: d.position,
    data: { deviceId: d.id },
    selected: selection?.kind === 'device' && selection.id === d.id,
  }));
}

export function GraphView() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const { byCable } = useAnalysis();

  // React Flow keeps measurement data on its nodes, so we hold them in local
  // state and only write positions back to the project when a drag ends.
  const [nodes, setNodes] = useState<DeviceNodeType[]>(() => toNodes(project.devices, selection, []));
  useEffect(() => {
    setNodes((prev) => toNodes(project.devices, selection, prev));
  }, [project.devices, selection]);

  const onNodesChange = useCallback(
    (changes: NodeChange<DeviceNodeType>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const edges = useMemo<Edge[]>(
    () =>
      project.cables.map((cable) => {
        const [from, to] = cable.ends;
        const port = getPort(project, from);
        const severity = worstSeverity(byCable.get(cable.id) ?? []);
        const selected = selection?.kind === 'cable' && selection.id === cable.id;
        const showIcon = severity === 'error' || severity === 'warning';
        return {
          id: cable.id,
          source: from.deviceId,
          sourceHandle: from.portId,
          target: to.deviceId,
          targetHandle: to.portId,
          selected,
          label: (showIcon ? SEVERITY_ICONS[severity] + ' ' : '') + cable.label,
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          className: 'cable-edge' + (severity === 'error' ? ' cable-edge--error' : ''),
          style: {
            stroke: port ? SIGNAL_COLORS[port.signal] : undefined,
            strokeWidth: selected ? 4 : 2.5,
            strokeDasharray: severity === 'error' ? '6 4' : undefined,
          },
          interactionWidth: 28,
        };
      }),
    [project, byCable, selection],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.sourceHandle || !c.targetHandle) return;
      if (c.source === c.target && c.sourceHandle === c.targetHandle) return;
      let from = { deviceId: c.source, portId: c.sourceHandle };
      let to = { deviceId: c.target, portId: c.targetHandle };
      // Store the cable as output -> input, whichever way it was drawn.
      const fromPort = getPort(project, from);
      const toPort = getPort(project, to);
      if (fromPort?.direction === 'in' || toPort?.direction === 'out') [from, to] = [to, from];
      let newId = '';
      apply((p) => {
        const r = addCable(p, from, to);
        newId = r.cable.id;
        return r.project;
      });
      select({ kind: 'cable', id: newId });
    },
    [project, apply, select],
  );

  return (
    <ReactFlow<DeviceNodeType, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, __, dragged) =>
        apply((p) => dragged.reduce((acc, n) => updateDevice(acc, n.id, { position: n.position }), p))
      }
      onConnect={onConnect}
      onNodeClick={(_, n) => select({ kind: 'device', id: n.id })}
      onEdgeClick={(_, e) => select({ kind: 'cable', id: e.id })}
      onPaneClick={() => select(null)}
      onDelete={({ nodes: delNodes, edges: delEdges }) => {
        apply((p) => {
          let next = delEdges.reduce((acc, e) => removeCable(acc, e.id), p);
          next = delNodes.reduce((acc, n) => removeDevice(acc, n.id), next);
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
      <Background gap={20} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="minimap" />
    </ReactFlow>
  );
}
