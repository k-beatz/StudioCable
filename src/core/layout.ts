import type { DeviceInstance, Project } from './model';
import { getPort } from './project';

export interface Size {
  width: number;
  height: number;
}

export const DEFAULT_SIZE: Size = { width: 260, height: 160 };
const COLUMN_GAP = 140;
const ROW_GAP = 48;
const BLOCK_GAP = 120;

/** Devices shown at one level: the main level (boardId null), or the inside of one board. */
export function visibleDevices(project: Project, boardId: string | null): DeviceInstance[] {
  const ids = new Set(project.devices.map((d) => d.id));
  return project.devices.filter((d) =>
    boardId ? d.containerId === boardId : !d.containerId || !ids.has(d.containerId),
  );
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
  const size = (id: string) => sizes.get(id) ?? DEFAULT_SIZE;
  const order = new Map(devices.map((d, i) => [d.id, i]));
  const edges = dedupe(levelEdges(project, boardId));

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
    const columns = orderColumns(assignColumns(block, blockEdges, order), blockEdges, order);
    const columnHeights = columns.map((col) => col.reduce((h, id) => h + size(id).height, 0) + ROW_GAP * (col.length - 1));
    const blockHeight = Math.max(...columnHeights);
    let x = 0;
    columns.forEach((col, i) => {
      // Centre each column vertically within the block.
      let y = top + (blockHeight - columnHeights[i]) / 2;
      for (const id of col) {
        positions.set(id, { x, y });
        y += size(id).height + ROW_GAP;
      }
      x += Math.max(...col.map((id) => size(id).width)) + COLUMN_GAP;
    });
    top += blockHeight + BLOCK_GAP;
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

/** Orders devices in each column so cables cross as little as possible (barycentre sweeps). */
function orderColumns(columns: string[][], edges: [string, string][], order: Map<string, number>): string[][] {
  const links = new Map<string, string[]>();
  for (const [a, b] of edges) {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  }
  const result = columns.map((c) => [...c]);
  const rank = new Map<string, number>();
  const updateRanks = () => result.forEach((col) => col.forEach((id, i) => rank.set(id, i)));
  updateRanks();

  const sortColumn = (col: string[], neighborColumn: Set<string>) => {
    const score = (id: string) => {
      const ns = (links.get(id) ?? []).filter((n) => neighborColumn.has(n));
      return ns.length ? ns.reduce((s, n) => s + rank.get(n)!, 0) / ns.length : rank.get(id)!;
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
