import type { DeviceInstance, Port, Project } from './model';
import { getPort } from './project';

/**
 * Signal flow tracing. Pure functions, no UI.
 *
 * The studio is treated as a graph whose nodes are ports. Signals move along
 * cables (from a sending port to a receiving port) and along a device's
 * internal routing (e.g. preamp input -> output, patchbay normal). A route
 * with `breakWhenPatched` is skipped while one of those ports has a cable.
 */

export interface PortRef {
  deviceId: string;
  portId: string;
}

export type Link = { kind: 'cable'; cableId: string } | { kind: 'internal' };

/** A path in signal direction: links[i] connects ports[i] to ports[i + 1]. */
export interface SignalPath {
  ports: PortRef[];
  links: Link[];
}

export interface Trace {
  /** Paths from the selection towards the destinations. */
  downstream: SignalPath[];
  /** Paths from the sources up to the selection (already in signal direction). */
  upstream: SignalPath[];
  cableIds: Set<string>;
  /** Keys "deviceId/portId". */
  portKeys: Set<string>;
  deviceIds: Set<string>;
}

type Direction = 'downstream' | 'upstream';

const MAX_PATHS = 200;
const MAX_DEPTH = 64;

export const portKey = (ref: PortRef) => `${ref.deviceId}/${ref.portId}`;

const sends = (p: Port) => p.direction !== 'in';
const receives = (p: Port) => p.direction !== 'out';

/**
 * All ports one step away from `ref` in the given direction. A signal takes at
 * most one internal hop per device (`afterInternal` = it just took one), so
 * it can't wander through unconnected ports of a device.
 */
function neighbors(project: Project, ref: PortRef, dir: Direction, occupied: Set<string>, afterInternal: boolean) {
  const result: { to: PortRef; link: Link }[] = [];
  const port = getPort(project, ref);
  if (!port) return result;

  // Along cables.
  if (dir === 'downstream' ? sends(port) : receives(port)) {
    for (const cable of project.cables) {
      const i = cable.ends.findIndex((e) => e.deviceId === ref.deviceId && e.portId === ref.portId);
      if (i < 0) continue;
      const other = cable.ends[1 - i];
      const otherPort = getPort(project, other);
      if (!otherPort) continue;
      if (dir === 'downstream' ? receives(otherPort) : sends(otherPort)) {
        result.push({ to: { deviceId: other.deviceId, portId: other.portId }, link: { kind: 'cable', cableId: cable.id } });
      }
    }
  }

  // Through the device.
  if (afterInternal) return result;
  const device = project.devices.find((d) => d.id === ref.deviceId);
  const routing = device ? project.templates[device.templateId]?.routing : undefined;
  for (const route of routing ?? []) {
    const [here, there] = dir === 'downstream' ? [route.from, route.to] : [route.to, route.from];
    if (here !== ref.portId) continue;
    const broken = route.breakWhenPatched?.some((p) => occupied.has(`${ref.deviceId}/${p}`));
    // Skip dead ends inside the device (e.g. an empty patchbay front jack).
    const leadsOn = occupied.has(`${ref.deviceId}/${there}`);
    if (!broken && leadsOn) result.push({ to: { deviceId: ref.deviceId, portId: there }, link: { kind: 'internal' } });
  }
  return result;
}

function occupiedPorts(project: Project): Set<string> {
  const set = new Set<string>();
  for (const c of project.cables) for (const e of c.ends) set.add(portKey(e));
  return set;
}

/**
 * Follows the signal from `start` until it ends. Every branch becomes its own
 * path. Returned paths start at `start` and follow the walking direction.
 */
function walk(project: Project, start: PortRef, dir: Direction, occupied: Set<string>): SignalPath[] {
  const paths: SignalPath[] = [];
  const visit = (path: SignalPath, seen: Set<string>) => {
    if (paths.length >= MAX_PATHS) return;
    const here = path.ports[path.ports.length - 1];
    const next = path.ports.length > MAX_DEPTH ? [] : neighbors(project, here, dir, occupied, path.links.at(-1)?.kind === 'internal').filter((n) => !seen.has(portKey(n.to)));
    if (next.length === 0) {
      if (path.links.length > 0) paths.push(path);
      return;
    }
    for (const n of next) {
      visit({ ports: [...path.ports, n.to], links: [...path.links, n.link] }, new Set(seen).add(portKey(n.to)));
    }
  };
  visit({ ports: [start], links: [] }, new Set([portKey(start)]));
  return paths;
}

function reversePath(path: SignalPath): SignalPath {
  return { ports: [...path.ports].reverse(), links: [...path.links].reverse() };
}

function buildTrace(project: Project, downstream: SignalPath[], upstream: SignalPath[], extraCables: string[] = []): Trace {
  const trace: Trace = {
    downstream,
    upstream,
    cableIds: new Set(extraCables),
    portKeys: new Set(),
    deviceIds: new Set(),
  };
  for (const path of [...downstream, ...upstream]) {
    for (const p of path.ports) {
      trace.portKeys.add(portKey(p));
      trace.deviceIds.add(p.deviceId);
    }
    for (const l of path.links) if (l.kind === 'cable') trace.cableIds.add(l.cableId);
  }
  for (const id of extraCables) {
    const cable = project.cables.find((c) => c.id === id);
    for (const e of cable?.ends ?? []) {
      trace.portKeys.add(portKey(e));
      trace.deviceIds.add(e.deviceId);
    }
  }
  return trace;
}

/** Signal flow through one port, in both directions. */
export function traceFromPort(project: Project, start: PortRef): Trace {
  const occupied = occupiedPorts(project);
  const down = walk(project, start, 'downstream', occupied);
  const up = walk(project, start, 'upstream', occupied).map(reversePath);
  const trace = buildTrace(project, down, up);
  trace.portKeys.add(portKey(start));
  trace.deviceIds.add(start.deviceId);
  return trace;
}

/** Signal flow through one cable: upstream from its sending end, downstream from its receiving end. */
export function traceFromCable(project: Project, cableId: string): Trace | undefined {
  const cable = project.cables.find((c) => c.id === cableId);
  if (!cable) return undefined;
  const occupied = occupiedPorts(project);
  let [from, to] = cable.ends;
  const fromPort = getPort(project, from);
  const toPort = getPort(project, to);
  if (fromPort?.direction === 'in' || toPort?.direction === 'out') [from, to] = [to, from];

  const link: Link = { kind: 'cable', cableId };
  const down = walk(project, to, 'downstream', occupied).map((p) => ({ ports: [from, ...p.ports], links: [link, ...p.links] }));
  const up = walk(project, from, 'upstream', occupied)
    .map(reversePath)
    .map((p) => ({ ports: [...p.ports, to], links: [...p.links, link] }));
  return buildTrace(
    project,
    down.length || up.length ? down : [{ ports: [from, to], links: [link] }],
    up,
    [cableId],
  );
}

/** Signal flow around a device: upstream from its inputs, downstream from its outputs. */
export function traceFromDevice(project: Project, device: DeviceInstance): Trace {
  const template = project.templates[device.templateId];
  const occupied = occupiedPorts(project);
  const down: SignalPath[] = [];
  const up: SignalPath[] = [];
  for (const port of template?.ports ?? []) {
    const ref = { deviceId: device.id, portId: port.id };
    // Only leave the device via cables here; internal routes are already covered
    // by starting from both its inputs and its outputs.
    if (sends(port)) down.push(...walk(project, ref, 'downstream', occupied).filter((p) => p.links[0]?.kind === 'cable'));
    if (receives(port)) up.push(...walk(project, ref, 'upstream', occupied).filter((p) => p.links[0]?.kind === 'cable').map(reversePath));
  }
  const trace = buildTrace(project, down, up);
  trace.deviceIds.add(device.id);
  return trace;
}
