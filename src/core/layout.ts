import { isPowerSignal, type DeviceInstance, type Project } from './model';
import { isPowerCable, isPowerDevice } from './power';
import { getPort } from './project';

export interface Size {
  width: number;
  height: number;
  /** Where each port sits, from the top of the device (by handle ID: the port ID, or "proxy|device|port" on a board). */
  portY?: Record<string, number>;
}

export const DEFAULT_SIZE: Size = { width: 260, height: 160 };
/** Smallest gap between two columns; it grows with the number of cables that run through it. */
const COLUMN_GAP = 160;
/** Room for one cable in a gap (its own lane, so cables stay easy to follow). */
const LANE = 16;
const ROW_GAP = 64;
const BLOCK_GAP = 140;

/** Rough size of a device block before it has been drawn (e.g. for ready-made setups). */
const HEADER = 56;
const PORT_ROW = 32;
export function estimateSize(project: Project, device: DeviceInstance): Size {
  const ports = (project.templates[device.templateId]?.ports ?? []).filter((p) => !isPowerSignal(p.signal));
  const left = ports.filter((p) => p.direction === 'in');
  const right = ports.filter((p) => p.direction !== 'in');
  const portY: Record<string, number> = {};
  left.forEach((p, i) => (portY[p.id] = HEADER + (i + 0.5) * PORT_ROW));
  right.forEach((p, i) => (portY[p.id] = HEADER + (i + 0.5) * PORT_ROW));
  return { width: 260, height: HEADER + Math.max(1, left.length, right.length) * PORT_ROW + 12, portY };
}

/** Devices shown at one level: the main level (boardId null), or the inside of one board. */
export function visibleDevices(project: Project, boardId: string | null): DeviceInstance[] {
  const ids = new Set(project.devices.map((d) => d.id));
  return project.devices.filter((d) =>
    boardId ? d.containerId === boardId : !d.containerId || !ids.has(d.containerId),
  );
}

/** Devices drawn at one level; power-only devices only when the power layer is shown. */
export function shownDevices(project: Project, boardId: string | null, showPower: boolean): DeviceInstance[] {
  const devices = visibleDevices(project, boardId);
  return showPower ? devices : devices.filter((d) => !isPowerDevice(project, d));
}

/**
 * Signal-flow edges between the devices of one level, as [from, to] pairs.
 * A pedal on a closed board counts as the board itself.
 */
export function levelEdges(project: Project, boardId: string | null): [string, string][] {
  const visible = new Set(visibleDevices(project, boardId).map((d) => d.id));
  const containerOf = new Map(project.devices.map((d) => [d.id, d.containerId]));
  const represent = (id: string): string | undefined => {
    if (visible.has(id)) return id;
    const c = containerOf.get(id);
    return c && visible.has(c) ? c : undefined;
  };
  const edges: [string, string][] = [];
  for (const cable of project.cables) {
    // Power cables would pull everything towards the power strip; they do not shape the layout.
    if (isPowerCable(project, cable)) continue;
    const [a, b] = cable.ends;
    const from = represent(a.deviceId);
    const to = represent(b.deviceId);
    if (!from || !to || from === to) continue;
    // Cables are stored output → input; only flip them if the ports say otherwise.
    const reversed = getPort(project, a)?.direction === 'in' && getPort(project, b)?.direction === 'out';
    edges.push(reversed ? [to, from] : [from, to]);
  }
  return edges;
}

/**
 * "Tidy up": arranges the devices of one level by signal flow.
 * Sources go left, destinations right; each connected setup gets its own block,
 * and devices without cables are lined up underneath.
 * Pure: returns a new project with new positions, nothing else changes.
 */
export function tidyLayout(
  project: Project,
  boardId: string | null,
  sizes: ReadonlyMap<string, Size> = new Map(),
): Project {
  const devices = visibleDevices(project, boardId);
  if (devices.length === 0) return project;
  const estimated = new Map(devices.map((d) => [d.id, estimateSize(project, d)]));
  const size = (id: string) => sizes.get(id) ?? estimated.get(id) ?? DEFAULT_SIZE;
  const order = new Map(devices.map((d, i) => [d.id, i]));
  const edges = dedupe(levelEdges(project, boardId));
  const links = portLinks(project, boardId);
  // Height of a port inside its device; falls back to the middle of the device.
  const portY = (deviceId: string, handle: string, fallback: string) => {
    const s = size(deviceId);
    return s.portY?.[handle] ?? s.portY?.[fallback] ?? estimated.get(deviceId)?.portY?.[fallback] ?? s.height / 2;
  };

  const neighbors = new Map<string, Set<string>>(devices.map((d) => [d.id, new Set()]));
  for (const [a, b] of edges) {
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  }

  // Connected setups, biggest first; lonely devices are handled separately.
  const components = connectedComponents(devices.map((d) => d.id), neighbors);
  const blocks = components.filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
  const singles = components.filter((c) => c.length === 1).map((c) => c[0]);

  const positions = new Map<string, { x: number; y: number }>();
  let top = 0;
  for (const block of blocks) {
    const ids = new Set(block);
    const blockEdges = edges.filter(([a]) => ids.has(a));
    const blockLinks = links
      .filter((l) => ids.has(l.from) && ids.has(l.to))
      .map((l) => ({ ...l, fromY: portY(l.from, l.fromHandle, l.fromPort), toY: portY(l.to, l.toHandle, l.toPort) }));
    const columns = orderColumns(assignColumns(block, blockEdges, order), blockLinks, size, order);
    const columnOf = new Map(columns.flatMap((col, i) => col.map((id) => [id, i] as const)));

    // Horizontal: every gap gets a lane per cable that runs through it.
    let x = 0;
    const xs: number[] = [];
    columns.forEach((col, i) => {
      xs.push(x);
      const through = blockLinks.filter((l) => {
        const [a, b] = [columnOf.get(l.from)!, columnOf.get(l.to)!].sort((m, n) => m - n);
        return a <= i && b > i;
      }).length;
      x += Math.max(...col.map((id) => size(id).width)) + Math.max(COLUMN_GAP, 90 + through * LANE);
    });

    // Vertical: line connected ports up, so cables run straight where they can.
    const ys = alignColumns(columns, columnOf, blockLinks, size);
    const minY = Math.min(...columns.flat().map((id) => ys.get(id)!));
    let bottom = 0;
    columns.forEach((col, i) => {
      for (const id of col) {
        const y = top + ys.get(id)! - minY;
        positions.set(id, { x: xs[i], y });
        bottom = Math.max(bottom, y + size(id).height);
      }
    });
    top = bottom + BLOCK_GAP;
  }

  // Unconnected devices: a row underneath, wrapping after a few.
  const perRow = Math.max(4, Math.ceil(Math.sqrt(singles.length)));
  for (let r = 0; r * perRow < singles.length; r++) {
    const row = singles.slice(r * perRow, (r + 1) * perRow);
    let x = 0;
    for (const id of row) {
      positions.set(id, { x, y: top });
      x += size(id).width + COLUMN_GAP / 2;
    }
    top += Math.max(...row.map((id) => size(id).height)) + ROW_GAP;
  }

  return {
    ...project,
    devices: project.devices.map((d) => {
      const p = positions.get(d.id);
      return p ? { ...d, position: { x: snap(p.x), y: snap(p.y) } } : d;
    }),
  };
}

const snap = (v: number) => Math.round(v / 10) * 10;

function dedupe(edges: [string, string][]): [string, string][] {
  const seen = new Set<string>();
  return edges.filter(([a, b]) => {
    const key = `${a}>${b}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function connectedComponents(ids: string[], neighbors: Map<string, Set<string>>): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const start of ids) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      for (const n of neighbors.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    result.push(comp);
  }
  return result;
}

/**
 * Column = length of the longest signal path leading to the device.
 * Loops (e.g. an FX send/return) are broken so they do not push devices endlessly right.
 */
function assignColumns(ids: string[], edges: [string, string][], order: Map<string, number>): string[][] {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [a, b] of edges) out.get(a)!.push(b);

  // Drop edges that close a loop (found by depth-first search from the original order).
  const state = new Map<string, 'active' | 'done'>();
  const kept: [string, string][] = [];
  const visit = (id: string) => {
    state.set(id, 'active');
    for (const n of out.get(id)!) {
      const s = state.get(n);
      if (s === 'active') continue;
      kept.push([id, n]);
      if (!s) visit(n);
    }
    state.set(id, 'done');
  };
  const byOrder = [...ids].sort((a, b) => order.get(a)! - order.get(b)!);
  // Start from real sources first, so loops are cut at their "return" end.
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const [, b] of edges) indegree.set(b, indegree.get(b)! + 1);
  for (const id of byOrder.filter((i) => indegree.get(i) === 0)) if (!state.has(id)) visit(id);
  for (const id of byOrder) if (!state.has(id)) visit(id);

  // Longest path on the remaining (acyclic) graph.
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [a, b] of kept) incoming.get(b)!.push(a);
  const column = new Map<string, number>();
  const depth = (id: string): number => {
    const known = column.get(id);
    if (known !== undefined) return known;
    column.set(id, 0);
    const d = Math.max(0, ...incoming.get(id)!.map((p) => depth(p) + 1));
    column.set(id, d);
    return d;
  };
  ids.forEach(depth);

  // Pull pure sources (e.g. a mic) right up to the column before their first destination.
  for (const id of ids) {
    if (incoming.get(id)!.length > 0) continue;
    const targets = kept.filter(([a]) => a === id).map(([, b]) => column.get(b)!);
    if (targets.length) column.set(id, Math.max(0, Math.min(...targets) - 1));
  }

  const count = Math.max(...column.values()) + 1;
  const columns: string[][] = Array.from({ length: count }, () => []);
  for (const id of byOrder) columns[column.get(id)!].push(id);
  return columns.filter((c) => c.length > 0);
}

/**
 * Orders devices in each column so cables cross as little as possible (barycentre
 * sweeps). Port-aware: a cable from the bottom port of a device counts lower than
 * one from its top port, so e.g. the computer on an interface's USB (its last
 * port) goes below the monitors on its outputs.
 */
function orderColumns(
  columns: string[][],
  links: (PortLink & { fromY: number; toY: number })[],
  size: (id: string) => Size,
  order: Map<string, number>,
): string[][] {
  // For each device: the neighbours it is cabled to, and where on that neighbour (0 = top, 1 = bottom).
  const ends = new Map<string, { other: string; at: number }[]>();
  const add = (id: string, other: string, y: number) =>
    ends.set(id, [...(ends.get(id) ?? []), { other, at: Math.min(1, Math.max(0, y / Math.max(1, size(other).height))) }]);
  for (const l of links) {
    add(l.from, l.to, l.toY);
    add(l.to, l.from, l.fromY);
  }
  const result = columns.map((c) => [...c]);
  const rank = new Map<string, number>();
  const updateRanks = () => result.forEach((col) => col.forEach((id, i) => rank.set(id, i)));
  updateRanks();

  const sortColumn = (col: string[], neighborColumn: Set<string>) => {
    const score = (id: string) => {
      const ns = (ends.get(id) ?? []).filter((e) => neighborColumn.has(e.other));
      return ns.length ? ns.reduce((s, e) => s + rank.get(e.other)! + e.at, 0) / ns.length : rank.get(id)! + 0.5;
    };
    const scores = new Map(col.map((id) => [id, score(id)]));
    col.sort((a, b) => scores.get(a)! - scores.get(b)! || order.get(a)! - order.get(b)!);
  };

  for (let sweep = 0; sweep < 4; sweep++) {
    for (let i = 1; i < result.length; i++) {
      sortColumn(result[i], new Set(result[i - 1]));
      updateRanks();
    }
    for (let i = result.length - 2; i >= 0; i--) {
      sortColumn(result[i], new Set(result[i + 1]));
      updateRanks();
    }
  }
  return result;
}

interface PortLink {
  from: string;
  to: string;
  /** Port IDs on the real devices, and the handle IDs they have at this level (proxies on a board). */
  fromPort: string;
  toPort: string;
  fromHandle: string;
  toHandle: string;
}

/** Every signal cable of the level, port to port, in signal direction (power cables don't shape the layout). */
function portLinks(project: Project, boardId: string | null): PortLink[] {
  const visible = new Set(visibleDevices(project, boardId).map((d) => d.id));
  const containerOf = new Map(project.devices.map((d) => [d.id, d.containerId]));
  const at = (deviceId: string, portId: string) => {
    if (visible.has(deviceId)) return { id: deviceId, handle: portId };
    const c = containerOf.get(deviceId);
    return c && visible.has(c) ? { id: c, handle: `proxy|${deviceId}|${portId}` } : undefined;
  };
  const result: PortLink[] = [];
  for (const cable of project.cables) {
    if (isPowerCable(project, cable)) continue;
    let [a, b] = cable.ends;
    if (getPort(project, a)?.direction === 'in' && getPort(project, b)?.direction === 'out') [a, b] = [b, a];
    const from = at(a.deviceId, a.portId);
    const to = at(b.deviceId, b.portId);
    if (!from || !to || from.id === to.id) continue;
    result.push({ from: from.id, to: to.id, fromPort: a.portId, toPort: b.portId, fromHandle: from.handle, toHandle: to.handle });
  }
  return result;
}

/**
 * Tops of the devices of one block. Each device moves towards the height where
 * its cables would run straight (port facing port), sweeping left to right and
 * back a few times; devices in a column keep their order and never overlap.
 */
function alignColumns(
  columns: string[][],
  columnOf: Map<string, number>,
  links: (PortLink & { fromY: number; toY: number })[],
  size: (id: string) => Size,
): Map<string, number> {
  const y = new Map<string, number>();
  // Start: each column stacked from the top.
  for (const col of columns) {
    let top = 0;
    for (const id of col) {
      y.set(id, top);
      top += size(id).height + ROW_GAP;
    }
  }

  const place = (col: string[], wanted: Map<string, number>) => {
    // Keep the order, push down to avoid overlaps, then shift the whole column back up
    // so that, on average, devices sit where they want to be.
    const tops: number[] = [];
    let floor = -Infinity;
    for (const id of col) {
      const t = Math.max(wanted.get(id) ?? y.get(id)!, floor);
      tops.push(t);
      floor = t + size(id).height + ROW_GAP;
    }
    const withWish = col.map((id, k) => (wanted.has(id) ? wanted.get(id)! - tops[k] : null)).filter((d): d is number => d !== null);
    // Moving the whole column keeps the gaps, so it can never create an overlap.
    const shift = withWish.length ? withWish.reduce((s, d) => s + d, 0) / withWish.length : 0;
    col.forEach((id, k) => y.set(id, tops[k] + shift));
  };

  const wish = (id: string, towards: 'left' | 'right') => {
    const c = columnOf.get(id)!;
    const targets: number[] = [];
    for (const l of links) {
      if (towards === 'left' && l.to === id && columnOf.get(l.from)! < c) targets.push(y.get(l.from)! + l.fromY - l.toY);
      if (towards === 'right' && l.from === id && columnOf.get(l.to)! > c) targets.push(y.get(l.to)! + l.toY - l.fromY);
    }
    return targets.length ? targets.reduce((s, v) => s + v, 0) / targets.length : undefined;
  };

  for (let sweep = 0; sweep < 4; sweep++) {
    for (let i = 1; i < columns.length; i++) {
      const wanted = new Map<string, number>();
      for (const id of columns[i]) {
        const w = wish(id, 'left');
        if (w !== undefined) wanted.set(id, w);
      }
      place(columns[i], wanted);
    }
    for (let i = columns.length - 2; i >= 0; i--) {
      const wanted = new Map<string, number>();
      for (const id of columns[i]) {
        const w = wish(id, 'right');
        if (w !== undefined) wanted.set(id, w);
      }
      place(columns[i], wanted);
    }
  }
  return y;
}
