import { connectDevices } from './autowire';
import { phantomBlocker, routeBlockers, switchedOff, type Blocker, type Setting } from './controls';
import { isPowerSignal, type CableEnd, type Port, type Project } from './model';
import { getPort } from './project';
import { checkCable, type Issue } from './validation';

/**
 * Troubleshooting: "why does the signal from A not arrive at B?"
 * Follows the signal from every output of the source, step by step. Inside a
 * device it uses the device's internal routing if it has one (pedals, amp
 * effect loops, patchbays); otherwise any input is assumed to reach any
 * output, as on a mixer or interface. Power ports are ignored.
 * Knobs and switches count: if the cables are fine but a switch closes the
 * path inside a device, the diagnosis names it and offers the right position.
 */

export interface DiagnosisStep {
  cableId: string;
  from: CableEnd;
  to: CableEnd;
  /** Warnings and errors of this cable (level, connectors, …). */
  issues: Issue[];
}

export interface Diagnosis {
  arrives: boolean;
  /** The way the signal takes: to the target, or as far as it gets. */
  steps: DiagnosisStep[];
  /** Why it stops (only when it does not arrive). */
  problem?: 'sourceUnplugged' | 'targetUnplugged' | 'stops' | 'setting';
  /** problem 'setting': the knobs or switches that close the path, with a position that opens it. */
  settings?: SettingChange[];
  /** The device where the signal ends (only when it does not arrive). */
  stuckAt?: string;
  /** A suggested cable (or stereo pair) that closes the gap, as a ready-made project. */
  fix?: { project: Project; added: string[]; fromDevice: string; toDevice: string };
}

export interface SettingChange {
  deviceId: string;
  controlId: string;
  label: string;
  from: Setting;
  to: Setting;
}

const key = (e: CableEnd) => `${e.deviceId}/${e.portId}`;
const isAudio = (p: Port | undefined): p is Port => !!p && !isPowerSignal(p.signal);
const sends = (p: Port) => p.direction !== 'in';
const receives = (p: Port) => p.direction !== 'out';

function portsOfDevice(project: Project, deviceId: string): Port[] {
  const d = project.devices.find((x) => x.id === deviceId);
  return (d && project.templates[d.templateId]?.ports) || [];
}

/** Ports the signal can leave a device by, after entering at `port`. */
function throughDevice(project: Project, at: CableEnd, occupied: Set<string>, ignoreControls = false): CableEnd[] {
  const d = project.devices.find((x) => x.id === at.deviceId);
  const template = d && project.templates[d.templateId];
  if (!template) return [];
  if (template.routing?.length) {
    return template.routing
      .filter((r) => r.from === at.portId)
      .filter((r) => !r.breakWhenPatched?.some((p) => occupied.has(`${at.deviceId}/${p}`)))
      .filter((r) => ignoreControls || routeBlockers(template, d, r).length === 0)
      .map((r) => ({ deviceId: at.deviceId, portId: r.to }));
  }
  return template.ports.filter((p) => isAudio(p) && sends(p) && p.id !== at.portId).map((p) => ({ deviceId: at.deviceId, portId: p.id }));
}

interface Search {
  via: Map<string, DiagnosisStep | null>;
  order: string[];
  start: CableEnd[];
  occupied: Set<string>;
  cablesFrom: Map<string, { cableId: string; to: CableEnd }[]>;
}

function search(project: Project, sourceId: string, targetId: string, ignoreControls: boolean): Search {
  const occupied = new Set(project.cables.flatMap((c) => c.ends.map(key)));
  const cablesFrom = new Map<string, { cableId: string; to: CableEnd }[]>();
  for (const c of project.cables) {
    const [a, b] = c.ends;
    const pa = getPort(project, a);
    const pb = getPort(project, b);
    if (!isAudio(pa) || !isAudio(pb)) continue;
    if (sends(pa) && receives(pb)) cablesFrom.set(key(a), [...(cablesFrom.get(key(a)) ?? []), { cableId: c.id, to: b }]);
    if (sends(pb) && receives(pa)) cablesFrom.set(key(b), [...(cablesFrom.get(key(b)) ?? []), { cableId: c.id, to: a }]);
  }

  // Breadth-first search over sending ports; remembers the cable that led to each device.
  const start = portsOfDevice(project, sourceId)
    .filter((p) => isAudio(p) && sends(p))
    .map((p) => ({ deviceId: sourceId, portId: p.id }));
  const via = new Map<string, DiagnosisStep | null>([[sourceId, null]]);
  const order: string[] = [sourceId];
  const seenPorts = new Set(start.map(key));
  const queue = [...start];
  while (queue.length) {
    const out = queue.shift()!;
    for (const { cableId, to } of cablesFrom.get(key(out)) ?? []) {
      if (!ignoreControls && cableBlocker(project, out, to)) continue;
      if (!via.has(to.deviceId)) {
        const cable = project.cables.find((c) => c.id === cableId)!;
        const issues = checkCable(project, cable).filter((i) => i.severity !== 'info');
        via.set(to.deviceId, { cableId, from: out, to, issues });
        order.push(to.deviceId);
      }
      if (to.deviceId === targetId) continue;
      for (const next of throughDevice(project, to, occupied, ignoreControls)) {
        if (seenPorts.has(key(next))) continue;
        seenPorts.add(key(next));
        queue.push(next);
      }
    }
  }

  return { via, order, start, occupied, cablesFrom };
}

export function diagnose(project: Project, sourceId: string, targetId: string): Diagnosis {
  const { via, order, start, occupied, cablesFrom } = search(project, sourceId, targetId, false);
  const pathTo = (deviceId: string, from = via): DiagnosisStep[] => {
    const steps: DiagnosisStep[] = [];
    for (let step = from.get(deviceId); step; step = from.get(step.from.deviceId)) steps.unshift(step);
    return steps;
  };

  if (via.has(targetId) && targetId !== sourceId) return { arrives: true, steps: pathTo(targetId) };

  // The cables are there, but a knob or switch closes the way inside a device.
  const free = search(project, sourceId, targetId, true);
  if (free.via.has(targetId) && targetId !== sourceId) {
    const steps = pathTo(targetId, free.via);
    const settings = blockingSettings(project, steps);
    if (settings.length) {
      const first = steps.findIndex((s) => s.to.deviceId === settings[0].deviceId);
      return { arrives: false, steps: steps.slice(0, first + 1), problem: 'setting', stuckAt: settings[0].deviceId, settings };
    }
  }

  // It does not arrive: find where it stops and what would close the gap.
  const sourceUnplugged = !start.some((s) => occupied.has(key(s)));
  const targetUnplugged = !portsOfDevice(project, targetId).some(
    (p) => isAudio(p) && receives(p) && occupied.has(`${targetId}/${p.id}`),
  );
  const canReachTarget = devicesLeadingTo(targetId, cablesFrom);
  // Try the furthest device first: the gap is usually right where the signal ends.
  for (const reached of [...order].reverse()) {
    for (const next of [targetId, ...canReachTarget]) {
      if (next === reached || via.has(next)) continue;
      const r = connectDevices(project, reached, next);
      if (r) {
        return {
          arrives: false,
          steps: pathTo(reached),
          problem: sourceUnplugged ? 'sourceUnplugged' : targetUnplugged ? 'targetUnplugged' : 'stops',
          stuckAt: reached,
          fix: { ...r, fromDevice: reached, toDevice: next },
        };
      }
    }
  }
  const last = order[order.length - 1];
  return {
    arrives: false,
    steps: pathTo(last),
    problem: sourceUnplugged ? 'sourceUnplugged' : targetUnplugged ? 'targetUnplugged' : 'stops',
    stuckAt: last,
  };
}

/** Devices from which a signal already reaches the target (via cables), nearest first. */
function devicesLeadingTo(
  targetId: string,
  cablesFrom: Map<string, { cableId: string; to: CableEnd }[]>,
): string[] {
  const into = new Map<string, Set<string>>();
  for (const [fromKey, list] of cablesFrom) {
    const fromDevice = fromKey.slice(0, fromKey.indexOf('/'));
    for (const { to } of list) into.set(to.deviceId, (into.get(to.deviceId) ?? new Set()).add(fromDevice));
  }
  const result: string[] = [];
  const seen = new Set([targetId]);
  const queue = [targetId];
  while (queue.length) {
    const d = queue.shift()!;
    for (const prev of into.get(d) ?? []) {
      if (seen.has(prev)) continue;
      seen.add(prev);
      result.push(prev);
      queue.push(prev);
    }
  }
  return result;
}

/** The controls that close the internal hops of a path (between consecutive cables). */
function blockingSettings(project: Project, steps: DiagnosisStep[]): SettingChange[] {
  const changes: SettingChange[] = [];
  for (let i = 0; i < steps.length; i++) {
    const b = cableBlocker(project, steps[i].from, steps[i].to);
    if (b) changes.push({ deviceId: b.deviceId, controlId: b.control.id, label: b.control.label, from: b.value, to: b.needed });
    if (i + 1 === steps.length) break;
    const at = steps[i].to;
    const out = steps[i + 1].from;
    const d = project.devices.find((x) => x.id === at.deviceId);
    const template = d && project.templates[d.templateId];
    if (!template) continue;
    // The search keeps one way per device, so the signal may have entered through
    // another (plugged-in) input than `at`, e.g. the right channel of a stereo pair.
    const plugged = new Set(project.cables.flatMap((c) => c.ends.filter((e) => e.deviceId === d.id).map((e) => e.portId)));
    const route = (template.routing ?? [])
      .filter((r) => r.to === out.portId && (r.from === at.portId || plugged.has(r.from)))
      .sort((a, b) => Number(b.from === at.portId) - Number(a.from === at.portId) || routeBlockers(template, d, a).length - routeBlockers(template, d, b).length)[0];
    if (!route) continue;
    for (const b of routeBlockers(template, d, route)) {
      if (changes.some((c) => c.deviceId === d.id && c.controlId === b.control.id)) continue;
      changes.push({ deviceId: d.id, controlId: b.control.id, label: b.control.label, from: b.value, to: b.needed });
    }
  }
  return changes;
}

/** Applies setting changes (e.g. the ones a diagnosis proposes). */
export function applySettings(project: Project, changes: SettingChange[]): Project {
  return {
    ...project,
    devices: project.devices.map((d) => {
      const mine = changes.filter((c) => c.deviceId === d.id);
      if (!mine.length) return d;
      return { ...d, settings: { ...d.settings, ...Object.fromEntries(mine.map((c) => [c.controlId, c.to])) } };
    }),
  };
}

/**
 * A switch that keeps a cable silent: the sending port is switched off (a mic's
 * on/off switch), or a condenser mic goes into an input whose phantom power is off.
 */
function cableBlocker(project: Project, from: CableEnd, to: CableEnd): (Blocker & { deviceId: string }) | undefined {
  const at = (end: CableEnd) => {
    const device = project.devices.find((x) => x.id === end.deviceId);
    return { device, template: device && project.templates[device.templateId] };
  };
  const src = at(from);
  const off = src.template && switchedOff(src.template, src.device, from.portId);
  if (off) return { ...off, deviceId: from.deviceId };
  if (!getPort(project, from)?.needsPhantom) return undefined;
  const dst = at(to);
  const phantom = dst.template && phantomBlocker(dst.template, dst.device, to.portId);
  return phantom ? { ...phantom, deviceId: to.deviceId } : undefined;
}
