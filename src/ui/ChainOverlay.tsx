import { useReactFlow } from '@xyflow/react';
import { useRef, useState, type PointerEvent } from 'react';

interface Stroke {
  /** Pointer positions relative to the overlay, for drawing the line. */
  points: { x: number; y: number }[];
  /** Devices the line has passed through, in order. */
  visited: string[];
}

/**
 * The "draw chain" tool: a transparent layer over the diagram. The user draws
 * one line through several devices; when the finger or mouse is lifted, the
 * devices are reported in the order they were crossed.
 */
export function ChainOverlay({ onFinish }: { onFinish: (deviceIds: string[]) => void }) {
  const flow = useReactFlow();
  const ref = useRef<HTMLDivElement>(null);
  const [stroke, setStroke] = useState<Stroke | null>(null);

  /** The device (not a marker) under a screen point, if any. */
  const deviceAt = (clientX: number, clientY: number): string | undefined => {
    const p = flow.screenToFlowPosition({ x: clientX, y: clientY });
    // Last drawn node is on top, so search from the end.
    for (const n of [...flow.getNodes()].reverse()) {
      if (n.type === 'external' || n.hidden) continue;
      const internal = flow.getInternalNode(n.id);
      const w = internal?.measured.width;
      const h = internal?.measured.height;
      if (!internal || !w || !h) continue;
      const { x, y } = internal.internals.positionAbsolute;
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) return n.id;
    }
    return undefined;
  };

  const local = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const extend = (s: Stroke, e: PointerEvent): Stroke => {
    const pt = local(e);
    const last = s.points[s.points.length - 1];
    const points = !last || Math.hypot(pt.x - last.x, pt.y - last.y) > 3 ? [...s.points, pt] : s.points;
    const id = deviceAt(e.clientX, e.clientY);
    const visited = id && s.visited[s.visited.length - 1] !== id ? [...s.visited, id] : s.visited;
    return { points, visited };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setStroke(extend({ points: [], visited: [] }, e));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (stroke) setStroke(extend(stroke, e));
  };
  const onPointerUp = () => {
    if (!stroke) return;
    const visited = stroke.visited;
    setStroke(null);
    onFinish(visited);
  };

  // Numbered badges at the centre of each device crossed so far.
  const badges = (stroke?.visited ?? []).map((id, k) => {
    const internal = flow.getInternalNode(id);
    const rect = ref.current?.getBoundingClientRect();
    if (!internal || !rect) return null;
    const { x, y } = internal.internals.positionAbsolute;
    const c = flow.flowToScreenPosition({
      x: x + (internal.measured.width ?? 0) / 2,
      y: y + (internal.measured.height ?? 0) / 2,
    });
    return { id, n: k + 1, x: c.x - rect.left, y: c.y - rect.top };
  });

  return (
    <div
      ref={ref}
      className="chain-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setStroke(null)}
    >
      {stroke && (
        <svg className="chain-overlay__svg">
          <polyline points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')} />
          {badges.map(
            (b) =>
              b && (
                <g key={`${b.id}-${b.n}`} transform={`translate(${b.x} ${b.y})`}>
                  <circle r={14} />
                  <text dy="0.35em">{b.n}</text>
                </g>
              ),
          )}
        </svg>
      )}
    </div>
  );
}
