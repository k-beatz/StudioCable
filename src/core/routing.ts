/**
 * Cable routing for the diagram: right-angled paths that go around devices,
 * spread out cables that would otherwise lie on top of each other, and mark
 * where two cables cross (so a "bridge" can be drawn there).
 * Pure geometry, no React: the diagram feeds in boxes and cable ends.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CableEnds {
  id: string;
  source: Point;
  target: Point;
  /** Which way each end leaves its device. */
  sourceSide: 'left' | 'right';
  targetSide: 'left' | 'right';
  /** Device boxes the ends belong to (the stub leaves them before turning). */
  sourceNode: string;
  targetNode: string;
}

export interface RouteOptions {
  /** Free space kept around devices. */
  margin: number;
  /** Distance between cables running side by side. */
  spacing: number;
  /** Cost of a bend, in pixels of extra length. Higher = straighter cables. */
  bendCost: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { margin: 24, spacing: 12, bendCost: 60 };

/** Routes all cables. Returns each cable's path as a list of corner points. */
export function routeCables(
  nodes: Rect[],
  cables: CableEnds[],
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
): Map<string, Point[]> {
  const boxes = new Map(nodes.map((n) => [n.id, n]));
  const obstacles = nodes.map((n) => inflate(n, options.margin));
  const baseXs = obstacles.flatMap((o) => [o.x, o.x + o.width]);
  const baseYs = obstacles.flatMap((o) => [o.y, o.y + o.height]);

  const routes = new Map<string, Point[]>();
  for (const cable of cables) {
    const start = stubEnd(cable.source, cable.sourceSide, boxes.get(cable.sourceNode), options.margin);
    const end = stubEnd(cable.target, cable.targetSide, boxes.get(cable.targetNode), options.margin);
    const middle =
      findPath(start, end, cable.sourceSide, cable.targetSide, obstacles, baseXs, baseYs, options) ??
      fallbackPath(start, end);
    routes.set(cable.id, simplify([cable.source, ...middle, cable.target]));
  }
  return nudge(routes, options.spacing);
}

// ---------- Geometry helpers ----------

function inflate(r: Rect, m: number): Rect {
  return { id: r.id, x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m };
}

const strictlyInside = (p: Point, r: Rect) =>
  p.x > r.x + 0.5 && p.x < r.x + r.width - 0.5 && p.y > r.y + 0.5 && p.y < r.y + r.height - 0.5;

/** The point just outside the device where a cable may start turning. */
function stubEnd(p: Point, side: 'left' | 'right', box: Rect | undefined, margin: number): Point {
  if (!box) return { x: p.x + (side === 'left' ? -margin : margin), y: p.y };
  return { x: side === 'left' ? Math.min(p.x, box.x) - margin : Math.max(p.x, box.x + box.width) + margin, y: p.y };
}

/** Removes points that lie on a straight line between their neighbours, and duplicates. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const straight = (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
      if (!straight) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** Used when no free path exists (e.g. devices overlap): a simple Z shape. */
function fallbackPath(a: Point, b: Point): Point[] {
  const midX = (a.x + b.x) / 2;
  return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
}

// ---------- Path search on a sparse grid ----------

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/**
 * A* search on the grid formed by the device borders (plus the cable's own ends
 * and the lines halfway between them). Cost = length + a penalty per bend, so
 * cables prefer few, clean corners and run in the middle of gaps.
 */
function findPath(
  start: Point,
  end: Point,
  startSide: 'left' | 'right',
  endSide: 'left' | 'right',
  obstacles: Rect[],
  baseXs: number[],
  baseYs: number[],
  options: RouteOptions,
): Point[] | null {
  // Obstacles that contain an end point (devices too close together) do not block that end.
  const blocking = obstacles.filter((o) => !strictlyInside(start, o) && !strictlyInside(end, o));
  const xs = gridLines([...baseXs, start.x, end.x]);
  const ys = gridLines([...baseYs, start.y, end.y]);
  const W = xs.length;
  const H = ys.length;
  const xi = (x: number) => xs.findIndex((v) => Math.abs(v - x) < 0.01);
  const yi = (y: number) => ys.findIndex((v) => Math.abs(v - y) < 0.01);
  const sx = xi(start.x);
  const sy = yi(start.y);
  const ex = xi(end.x);
  const ey = yi(end.y);
  if (sx < 0 || sy < 0 || ex < 0 || ey < 0) return null;

  const free = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const p = { x: xs[i], y: ys[j] };
      free[j * W + i] = blocking.some((o) => strictlyInside(p, o)) ? 0 : 1;
    }
  }
  // A step between neighbouring grid points is blocked if its middle is inside a device.
  const stepFree = (i: number, j: number, ni: number, nj: number) => {
    const mid = { x: (xs[i] + xs[ni]) / 2, y: (ys[j] + ys[nj]) / 2 };
    return !blocking.some((o) => strictlyInside(mid, o));
  };

  // The cable leaves the start outwards and arrives at the end from outside.
  const startDir = startSide === 'left' ? 1 : 0;
  const endDir = endSide === 'left' ? 0 : 1; // direction of travel when arriving
  const key = (i: number, j: number, d: number) => (j * W + i) * 4 + d;
  const g = new Float64Array(W * H * 4).fill(Infinity);
  const prev = new Int32Array(W * H * 4).fill(-1);
  const heap = new MinHeap();
  const h = (i: number, j: number) => Math.abs(xs[i] - end.x) + Math.abs(ys[j] - end.y);

  const s = key(sx, sy, startDir);
  g[s] = 0;
  heap.push(s, h(sx, sy));
  let found = -1;
  while (heap.size > 0) {
    const cur = heap.pop();
    const d = cur % 4;
    const cell = (cur - d) / 4;
    const i = cell % W;
    const j = (cell - i) / W;
    if (i === ex && j === ey) {
      // Arriving from the wrong side was already charged extra, so the first arrival is the best one.
      found = cur;
      break;
    }
    for (let nd = 0; nd < 4; nd++) {
      const { dx, dy } = DIRS[nd];
      // No U-turns.
      if (DIRS[d].dx === -dx && DIRS[d].dy === -dy) continue;
      const ni = i + dx;
      const nj = j + dy;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      if (!free[nj * W + ni] && !(ni === ex && nj === ey)) continue;
      if (!stepFree(i, j, ni, nj)) continue;
      const len = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
      let cost = g[cur] + len + (nd !== d ? options.bendCost : 0);
      if (ni === ex && nj === ey && nd !== endDir) cost += options.bendCost * 2;
      const nk = key(ni, nj, nd);
      if (cost < g[nk]) {
        g[nk] = cost;
        prev[nk] = cur;
        heap.push(nk, cost + h(ni, nj));
      }
    }
  }
  if (found < 0) return null;

  const path: Point[] = [];
  for (let k = found; k >= 0; k = prev[k]) {
    const cell = (k - (k % 4)) / 4;
    const i = cell % W;
    path.push({ x: xs[i], y: ys[(cell - i) / W] });
  }
  return path.reverse();
}

/** Sorted unique lines plus the lines halfway between neighbours (the middle of each gap). */
function gridLines(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b).filter((v, k, all) => k === 0 || v - all[k - 1] > 0.01);
  const out: number[] = [];
  for (let k = 0; k < sorted.length; k++) {
    out.push(sorted[k]);
    if (k + 1 < sorted.length && sorted[k + 1] - sorted[k] > 4) out.push((sorted[k] + sorted[k + 1]) / 2);
  }
  return out;
}

class MinHeap {
  private keys: number[] = [];
  private prios: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, prio: number) {
    const { keys, prios } = this;
    keys.push(key);
    prios.push(prio);
    let i = keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (prios[p] <= prios[i]) break;
      [keys[p], keys[i]] = [keys[i], keys[p]];
      [prios[p], prios[i]] = [prios[i], prios[p]];
      i = p;
    }
  }
  pop(): number {
    const { keys, prios } = this;
    const top = keys[0];
    const lastK = keys.pop()!;
    const lastP = prios.pop()!;
    if (keys.length > 0) {
      keys[0] = lastK;
      prios[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && prios[l] < prios[m]) m = l;
        if (r < keys.length && prios[r] < prios[m]) m = r;
        if (m === i) break;
        [keys[m], keys[i]] = [keys[i], keys[m]];
        [prios[m], prios[i]] = [prios[i], prios[m]];
        i = m;
      }
    }
    return top;
  }
}

// ---------- Spreading out cables that share a line ----------

interface Seg {
  cable: string;
  index: number; // segment from points[index] to points[index + 1]
  pos: number; // x of a vertical / y of a horizontal segment
  from: number;
  to: number;
  order: number; // used to sort cables within a bundle
}

/**
 * Cables routed along the same line would be drawn on top of each other.
 * Segments that overlap are moved apart by `spacing`. The first and last
 * segments stay where they are, because they are attached to the ports.
 */
function nudge(routes: Map<string, Point[]>, spacing: number): Map<string, Point[]> {
  const result = new Map([...routes].map(([id, pts]) => [id, pts.map((p) => ({ ...p }))]));
  for (const vertical of [true, false]) {
    const segs: Seg[] = [];
    for (const [cable, pts] of result) {
      for (let k = 1; k < pts.length - 2; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        const isVertical = Math.abs(a.x - b.x) < 0.5;
        if (isVertical !== vertical) continue;
        const [from, to] = vertical ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        // Order bundles by where the cable comes from, which keeps them from swapping places.
        const order = vertical ? pts[k - 1].y : pts[k - 1].x;
        segs.push({ cable, index: k, pos: vertical ? a.x : a.y, from, to, order });
      }
    }
    // Group by line (lines closer than the spacing look like one), then into clusters of
    // segments that overlap or nearly touch: cables that only meet end to end look joined too.
    const lines: Seg[][] = [];
    for (const s of [...segs].sort((a, b) => a.pos - b.pos)) {
      const last = lines[lines.length - 1];
      if (last && s.pos - last[last.length - 1].pos < spacing) last.push(s);
      else lines.push([s]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.from - b.from);
      let cluster: Seg[] = [];
      let reach = -Infinity;
      const flush = () => {
        const cables = new Set(cluster.map((s) => s.cable));
        if (cables.size > 1) spread(cluster, spacing, vertical, result);
        cluster = [];
      };
      for (const s of line) {
        if (s.from > reach + spacing) flush();
        cluster.push(s);
        reach = Math.max(reach, s.to);
      }
      flush();
    }
  }
  return result;
}

function spread(cluster: Seg[], spacing: number, vertical: boolean, routes: Map<string, Point[]>) {
  // One lane per cable (a cable with two pieces in the cluster keeps one lane).
  const lanes = [...new Set([...cluster].sort((a, b) => a.order - b.order).map((s) => s.cable))];
  const n = lanes.length;
  // Lines in a cluster may differ by a few pixels: spread around their middle.
  const centre = cluster.reduce((sum, s) => sum + s.pos, 0) / cluster.length;
  // Stay within the free margin around devices.
  const gap = n > 1 ? Math.min(spacing, 48 / (n - 1)) : 0;
  cluster.forEach((s) => {
    const k = lanes.indexOf(s.cable);
    const offset = centre + (k - (n - 1) / 2) * gap - s.pos;
    const pts = routes.get(s.cable)!;
    if (vertical) {
      pts[s.index].x += offset;
      pts[s.index + 1].x += offset;
    } else {
      pts[s.index].y += offset;
      pts[s.index + 1].y += offset;
    }
  });
}

// ---------- Crossings ("bridges") ----------

/**
 * Where a horizontal piece of one cable crosses a vertical piece of another.
 * The bridge is always drawn on the horizontal cable, so each crossing gets
 * exactly one bridge.
 */
export function findCrossings(routes: Map<string, Point[]>, clearance = 8): Map<string, Point[]> {
  const horizontals: { cable: string; y: number; x1: number; x2: number }[] = [];
  const verticals: { cable: string; x: number; y1: number; y2: number }[] = [];
  for (const [cable, pts] of routes) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      if (Math.abs(a.y - b.y) < 0.5) horizontals.push({ cable, y: a.y, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x) });
      else if (Math.abs(a.x - b.x) < 0.5) verticals.push({ cable, x: a.x, y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) });
    }
  }
  const crossings = new Map<string, Point[]>();
  for (const h of horizontals) {
    for (const v of verticals) {
      if (v.cable === h.cable) continue;
      if (v.x <= h.x1 + clearance || v.x >= h.x2 - clearance) continue;
      if (h.y <= v.y1 + clearance || h.y >= v.y2 - clearance) continue;
      crossings.set(h.cable, [...(crossings.get(h.cable) ?? []), { x: v.x, y: h.y }]);
    }
  }
  return crossings;
}

/**
 * SVG path through the corner points: rounded corners (bigger radius = softer
 * "curved" look) and a small arc wherever the cable jumps over another one.
 */
export function pathWithBridges(points: Point[], bridges: Point[] = [], radius = 10, bridgeSize = 6): string {
  return drawCable(points, bridges, radius, bridgeSize).path;
}

/**
 * Like pathWithBridges, but also returns a separate path of just the bridge
 * arcs. Drawn underneath in the background colour and a bit wider, it cuts a
 * small gap into the crossed cable so the bridge stays visible when zoomed out.
 */
export function drawCable(
  points: Point[],
  bridges: Point[] = [],
  radius = 10,
  bridgeSize = 6,
): { path: string; halo: string } {
  const arcs: string[] = [];
  if (points.length < 2) return { path: '', halo: '' };
  const corner = (k: number) => {
    // Corner radius limited by half the neighbouring segment lengths.
    const a = points[k - 1];
    const b = points[k];
    const c = points[k + 1];
    const r = Math.min(radius, dist(a, b) / 2, dist(b, c) / 2);
    return { r, inPt: towards(b, a, r), outPt: towards(b, c, r) };
  };
  let d = `M ${points[0].x} ${points[0].y}`;
  let from = points[0];
  for (let k = 1; k < points.length; k++) {
    const b = points[k];
    const isLast = k === points.length - 1;
    const c = isLast ? null : corner(k);
    const lineEnd = c ? c.inPt : b;
    d += segmentWithBridges(from, lineEnd, bridges, bridgeSize, arcs);
    if (c) {
      d += ` Q ${b.x} ${b.y} ${c.outPt.x} ${c.outPt.y}`;
      from = c.outPt;
    }
  }
  return { path: d, halo: arcs.join(' ') };
}

function segmentWithBridges(a: Point, b: Point, bridges: Point[], size: number, arcs: string[]): string {
  const horizontal = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
  if (!horizontal) return ` L ${b.x} ${b.y}`;
  const dir = Math.sign(b.x - a.x);
  const lo = Math.min(a.x, b.x) + size;
  const hi = Math.max(a.x, b.x) - size;
  const hops = bridges
    .filter((p) => Math.abs(p.y - a.y) < 0.5 && p.x > lo && p.x < hi)
    .map((p) => p.x)
    .sort((m, n) => (m - n) * dir);
  let d = '';
  let lastX = -Infinity * dir;
  for (const x of hops) {
    // Skip bridges that would overlap the previous one.
    if ((x - lastX) * dir < size * 2) continue;
    const arc = `A ${size} ${size} 0 0 ${dir > 0 ? 1 : 0} ${x + size * dir} ${a.y}`;
    d += ` L ${x - size * dir} ${a.y} ${arc}`;
    arcs.push(`M ${x - size * dir} ${a.y} ${arc}`);
    lastX = x;
  }
  return d + ` L ${b.x} ${b.y}`;
}

const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function towards(from: Point, to: Point, len: number): Point {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * len, y: from.y + ((to.y - from.y) / d) * len };
}

/** A good place for the cable label: the middle of the longest straight piece. */
export function labelPoint(points: Point[]): Point {
  let best = { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0 };
  let bestLen = -1;
  for (let k = 0; k < points.length - 1; k++) {
    const len = dist(points[k], points[k + 1]);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (points[k].x + points[k + 1].x) / 2, y: (points[k].y + points[k + 1].y) / 2 };
    }
  }
  return best;
}
