import { describe, expect, it } from 'vitest';
import { findCrossings, pathWithBridges, routeCables, type CableEnds, type Point, type Rect } from './routing';

const box = (id: string, x: number, y: number, width = 200, height = 120): Rect => ({ id, x, y, width, height });

/** Cable from the right side of `a` to the left side of `b`. */
function cable(id: string, a: Rect, ay: number, b: Rect, by: number): CableEnds {
  return {
    id,
    source: { x: a.x + a.width, y: a.y + ay },
    target: { x: b.x, y: b.y + by },
    sourceSide: 'right',
    targetSide: 'left',
    sourceNode: a.id,
    targetNode: b.id,
  };
}

function segments(pts: Point[]) {
  return pts.slice(1).map((p, k) => [pts[k], p] as const);
}

/** True if the straight piece a-b passes through the inside of the box. */
function crosses(a: Point, b: Point, r: Rect) {
  const steps = 50;
  for (let s = 1; s < steps; s++) {
    const x = a.x + ((b.x - a.x) * s) / steps;
    const y = a.y + ((b.y - a.y) * s) / steps;
    if (x > r.x + 1 && x < r.x + r.width - 1 && y > r.y + 1 && y < r.y + r.height - 1) return true;
  }
  return false;
}

describe('routeCables', () => {
  it('only uses horizontal and vertical pieces, starting and ending at the ports', () => {
    const a = box('a', 0, 0);
    const b = box('b', 500, 200);
    const route = routeCables([a, b], [cable('c', a, 40, b, 60)]).get('c')!;
    expect(route[0]).toEqual({ x: 200, y: 40 });
    expect(route[route.length - 1]).toEqual({ x: 500, y: 260 });
    for (const [p, q] of segments(route)) expect(p.x === q.x || p.y === q.y).toBe(true);
  });

  it('goes around a device that is in the way', () => {
    const a = box('a', 0, 0);
    const blocker = box('m', 350, -50, 200, 300);
    const b = box('b', 800, 0);
    const route = routeCables([a, blocker, b], [cable('c', a, 60, b, 60)]).get('c')!;
    for (const [p, q] of segments(route)) expect(crosses(p, q, blocker)).toBe(false);
  });

  it('does not run through its own devices', () => {
    // Target is to the left of the source: the cable has to loop around both.
    const a = box('a', 600, 0);
    const b = box('b', 0, 0);
    const route = routeCables([a, b], [cable('c', a, 60, b, 60)]).get('c')!;
    for (const [p, q] of segments(route).slice(1, -1)) {
      expect(crosses(p, q, a)).toBe(false);
      expect(crosses(p, q, b)).toBe(false);
    }
  });

  it('spreads out cables that would share the same line', () => {
    const a = box('a', 0, 0);
    const b = box('b', 600, 400);
    const routes = routeCables([a, b], [cable('c1', a, 30, b, 30), cable('c2', a, 60, b, 60), cable('c3', a, 90, b, 90)]);
    const verticalXs = [...routes.values()].map((pts) => {
      const v = segments(pts).find(([p, q]) => p.x === q.x && Math.abs(p.y - q.y) > 50)!;
      return v[0].x;
    });
    expect(new Set(verticalXs).size).toBe(3);
  });
});

describe('findCrossings', () => {
  it('marks a crossing on the horizontal cable only', () => {
    const routes = new Map<string, Point[]>([
      ['h', [{ x: 0, y: 100 }, { x: 300, y: 100 }]],
      ['v', [{ x: 150, y: 0 }, { x: 150, y: 300 }]],
    ]);
    const crossings = findCrossings(routes);
    expect(crossings.get('h')).toEqual([{ x: 150, y: 100 }]);
    expect(crossings.get('v')).toBeUndefined();
  });

  it('ignores cables that only touch at their ends', () => {
    const routes = new Map<string, Point[]>([
      ['h', [{ x: 0, y: 100 }, { x: 150, y: 100 }]],
      ['v', [{ x: 150, y: 0 }, { x: 150, y: 300 }]],
    ]);
    expect(findCrossings(routes).size).toBe(0);
  });
});

describe('pathWithBridges', () => {
  it('draws an arc at each bridge', () => {
    const d = pathWithBridges([{ x: 0, y: 0 }, { x: 200, y: 0 }], [{ x: 100, y: 0 }]);
    expect(d).toContain('A 6 6');
  });

  it('rounds corners', () => {
    const d = pathWithBridges([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    expect(d).toContain('Q 100 0');
  });
});

describe('routeCables with real-world coordinates', () => {
  it('keeps every piece straight even when ports sit at fractional positions', () => {
    const a = box('a', 0.3, 0.7);
    const b = box('b', 520.25, 333.1);
    const c: CableEnds = { ...cable('c', a, 40.77, b, 61.13), source: { x: 200.76, y: 41.47 } };
    const route = routeCables([a, b], [c]).get('c')!;
    for (const [p, q] of segments(route)) expect(Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01).toBe(true);
  });
});
