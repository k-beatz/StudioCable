import { Position, type EdgeProps } from '@xyflow/react';
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import type { RoutedEdgeType } from './RoutedEdge';
import { isTouchDevice } from './device';

/**
 * A patch cable that hangs down between its two plugs, drawn on top of the
 * devices. Its lowest point is a small spring simulation: when a device moves
 * (or the cable is first plugged in) the cable swings and settles.
 * The animation writes straight to the SVG elements, so React does not
 * re-render on every frame.
 */

interface Sim {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const STIFFNESS = 140;
const DAMPING = 7;
const DT = 1 / 60;

/** Where the middle of the cable hangs when it is at rest. */
function restPoint(sx: number, sy: number, tx: number, ty: number) {
  const span = Math.hypot(tx - sx, ty - sy);
  const sag = Math.min(240, 24 + span * 0.28);
  return { x: (sx + tx) / 2, y: (sy + ty) / 2 + sag };
}

/** Quadratic curve from s to t that passes through the middle point m. */
function curve(sx: number, sy: number, tx: number, ty: number, m: { x: number; y: number }) {
  const cx = 2 * m.x - (sx + tx) / 2;
  const cy = 2 * m.y - (sy + ty) / 2;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
}

export const HangingEdge = memo(function HangingEdge(props: EdgeProps<RoutedEdgeType>) {
  // React Flow gives the outer edge of each port; the plug sits on the middle of the jack.
  const inset = isTouchDevice() ? 17 : 13;
  const towardsNode = (pos: Position) => (pos === Position.Right ? -inset : pos === Position.Left ? inset : 0);
  const sx = props.sourceX + towardsNode(props.sourcePosition);
  const sy = props.sourceY;
  const tx = props.targetX + towardsNode(props.targetPosition);
  const ty = props.targetY;
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const label = useRef<SVGGElement>(null);
  const sim = useRef<Sim | null>(null);
  const frame = useRef(0);
  const ends = useRef({ sx, sy, tx, ty });
  ends.current = { sx, sy, tx, ty };

  const draw = () => {
    const { sx, sy, tx, ty } = ends.current;
    const m = sim.current ?? restPoint(sx, sy, tx, ty);
    const d = curve(sx, sy, tx, ty, m);
    for (const p of paths.current) p?.setAttribute('d', d);
    label.current?.setAttribute('transform', `translate(${m.x} ${m.y})`);
  };

  useLayoutEffect(() => {
    // A new cable starts stretched straight and then drops.
    sim.current ??= { x: (sx + tx) / 2, y: (sy + ty) / 2, vx: 0, vy: 0 };
    draw();
    if (frame.current) return;
    const step = () => {
      const s = sim.current!;
      const { sx, sy, tx, ty } = ends.current;
      const r = restPoint(sx, sy, tx, ty);
      s.vx += (STIFFNESS * (r.x - s.x) - DAMPING * s.vx) * DT;
      s.vy += (STIFFNESS * (r.y - s.y) - DAMPING * s.vy) * DT;
      s.x += s.vx * DT;
      s.y += s.vy * DT;
      const settled = Math.abs(r.x - s.x) + Math.abs(r.y - s.y) < 0.3 && Math.abs(s.vx) + Math.abs(s.vy) < 0.3;
      if (settled) {
        s.x = r.x;
        s.y = r.y;
        s.vx = s.vy = 0;
      }
      draw();
      frame.current = settled ? 0 : requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    // draw() and step() read the latest ends from refs, so only the ends are dependencies.
  }, [sx, sy, tx, ty]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const color = (props.style?.stroke as string | undefined) ?? '#888';
  const width = Number(props.style?.strokeWidth ?? 3) + 2.5;
  const labelText = typeof props.label === 'string' ? props.label : '';
  const labelWidth = labelText.length * 6.4 + 12;
  return (
    <>
      {/* Soft shadow below the cable, so it reads as lying on top of the devices. */}
      <path
        ref={(el) => {
          paths.current[0] = el;
        }}
        className="hanging-cable__shadow"
        fill="none"
        strokeWidth={width + 3}
        strokeLinecap="round"
      />
      <path
        ref={(el) => {
          paths.current[1] = el;
        }}
        className="react-flow__edge-path hanging-cable"
        // Inline style: React Flow's stylesheet would override plain SVG attributes.
        style={{
          fill: 'none',
          stroke: color,
          strokeWidth: width,
          strokeLinecap: 'round',
          strokeDasharray: props.style?.strokeDasharray,
        }}
      />
      {/* Highlight along the top of the cable for a rounded, rubbery look. */}
      <path
        ref={(el) => {
          paths.current[2] = el;
        }}
        className="hanging-cable__shine"
        fill="none"
        strokeWidth={Math.max(1, width / 3)}
        strokeLinecap="round"
        transform="translate(0 -1)"
      />
      <path
        ref={(el) => {
          paths.current[3] = el;
        }}
        className="react-flow__edge-interaction"
        fill="none"
        strokeOpacity={0}
        strokeWidth={props.interactionWidth ?? 24}
      />
      {/* Plug heads at both ends. */}
      {[
        [sx, sy],
        [tx, ty],
      ].map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={width + 2.5} fill={color} className="hanging-cable__plug" />
      ))}
      {labelText && (
        <g ref={label} className="hanging-cable__label">
          <rect x={-labelWidth / 2} y={-9} width={labelWidth} height={18} rx={9} fill={color} />
          <text textAnchor="middle" dy="0.35em">
            {labelText}
          </text>
        </g>
      )}
    </>
  );
});
