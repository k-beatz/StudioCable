import { BaseEdge, getBezierPath, getSmoothStepPath, useStore, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { drawCable, labelPoint, type Point } from '../core/routing';

export type RoutedEdgeData = {
  /** Corner points from the router; missing until the devices have been measured. */
  points?: Point[];
  /** Where this cable jumps over another one. */
  bridges?: Point[];
  curved: boolean;
};
export type RoutedEdgeType = Edge<RoutedEdgeData, 'routed' | 'hanging'>;

const near = (p: Point, x: number, y: number) => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2;

/**
 * A cable drawn along the route computed for the whole diagram. While a device
 * is being dragged its cables no longer match their route, so they fall back to
 * a simple path until the device is dropped and routing runs again.
 */
export const RoutedEdge = memo(function RoutedEdge(props: EdgeProps<RoutedEdgeType>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const pts = data?.points;
  const curved = data?.curved ?? false;
  // Bridges keep roughly the same size on screen at any zoom (rounded so that
  // zooming does not redraw every cable on every frame).
  const zoom = useStore((s) => Math.round(s.transform[2] * 10) / 10);
  const bridgeSize = Math.min(24, Math.max(6, 8 / Math.max(zoom, 0.1)));
  let path: string;
  let halo = '';
  let labelX: number;
  let labelY: number;
  if (pts && pts.length >= 2 && near(pts[0], sourceX, sourceY) && near(pts[pts.length - 1], targetX, targetY)) {
    ({ path, halo } = drawCable(pts, data?.bridges, curved ? 28 : 10, bridgeSize));
    ({ x: labelX, y: labelY } = labelPoint(pts));
  } else if (curved) {
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  } else {
    [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 10,
      offset: 24,
    });
  }
  const width = Number(props.style?.strokeWidth ?? 3);
  return (
    <>
      {halo && (
        <path
          d={halo}
          fill="none"
          stroke="var(--bg)"
          strokeWidth={width + Math.max(4, 5 / Math.max(zoom, 0.1))}
          strokeLinecap="round"
          style={{ opacity: props.style?.opacity }}
        />
      )}
      <BaseEdge
        id={props.id}
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={props.label}
        labelStyle={props.labelStyle}
        labelShowBg={props.labelShowBg}
        labelBgStyle={props.labelBgStyle}
        labelBgPadding={props.labelBgPadding}
        labelBgBorderRadius={props.labelBgBorderRadius}
        style={props.style}
        markerEnd={props.markerEnd}
        interactionWidth={props.interactionWidth}
      />
    </>
  );
});
