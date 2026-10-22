import { BaseEdge, getBezierPath, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { labelPoint, pathWithBridges, type Point } from '../core/routing';

export type RoutedEdgeData = {
  /** Corner points from the router; missing until the devices have been measured. */
  points?: Point[];
  /** Where this cable jumps over another one. */
  bridges?: Point[];
  curved: boolean;
};
export type RoutedEdgeType = Edge<RoutedEdgeData, 'routed'>;

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
  let path: string;
  let labelX: number;
  let labelY: number;
  if (pts && pts.length >= 2 && near(pts[0], sourceX, sourceY) && near(pts[pts.length - 1], targetX, targetY)) {
    path = pathWithBridges(pts, data?.bridges, curved ? 28 : 10);
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
  return (
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
  );
});
