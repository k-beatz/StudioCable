import { getBezierPath, Position, useInternalNode, type ConnectionLineComponentProps } from '@xyflow/react';
import { getPort } from '../core/project';
import { useProjectStore } from '../store/projectStore';
import { usePull } from './connect';
import { SIGNAL_COLORS } from './labels';

/**
 * The line under the finger while connecting. When a plug is being pulled out
 * of a port, the cable hangs from its other (still plugged-in) end instead of
 * from the port it came out of.
 */
export function PullLine(props: ConnectionLineComponentProps) {
  const pull = usePull((s) => s.pull);
  const node = useInternalNode(pull?.fixedNode ?? '');
  const project = useProjectStore((s) => s.project);

  let fromX = props.fromX;
  let fromY = props.fromY;
  let fromPosition = props.fromPosition;
  let color: string | undefined;
  if (pull && node) {
    const bounds = [...(node.internals.handleBounds?.source ?? []), ...(node.internals.handleBounds?.target ?? [])];
    const handle = bounds.find((h) => h.id === pull.fixedHandle);
    if (handle) {
      fromX = node.internals.positionAbsolute.x + handle.x + handle.width / 2;
      fromY = node.internals.positionAbsolute.y + handle.y + handle.height / 2;
      fromPosition = handle.position;
    }
    const port = getPort(project, pull.fixed);
    color = port ? SIGNAL_COLORS[port.signal] : undefined;
  }
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: props.toX,
    targetY: props.toY,
    targetPosition: props.toPosition ?? (fromPosition === Position.Left ? Position.Right : Position.Left),
  });
  return (
    <g>
      <path
        className={'react-flow__connection-path' + (pull ? ' pull-line' : '')}
        d={path}
        fill="none"
        style={{ ...props.connectionLineStyle, ...(color ? { stroke: color } : {}) }}
      />
      {pull && <circle className="pull-line__plug" cx={props.toX} cy={props.toY} r={7} fill={color ?? 'currentColor'} />}
    </g>
  );
}
