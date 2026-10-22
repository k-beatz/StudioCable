import { isPowerSignal, type CableEnd, type DeviceCategory, type DeviceInstance, type Port, type Project } from './model';
import { addCable, exposedPorts } from './project';
import { checkCable, computeOccupancy, worstSeverity } from './validation';

/**
 * Automatic wiring: finds sensible port pairs between devices, for the
 * "draw a chain" tool and for "suggest wiring". Pure functions; the result is
 * a new project plus the IDs of the cables that were added.
 */

interface Candidate {
  deviceId: string;
  port: Port;
  /** Position of the port on its device, used to prefer "Input 1" over "Input 7". */
  index: number;
}

export interface WiringResult {
  project: Project;
  added: string[];
  /** Device pairs that could not be connected (no free, compatible ports). */
  failed: [string, string][];
}

/** Minimum score for a connection to be made at all. */
const MIN_SCORE = 60;

/**
 * Ports a device offers to the outside. A closed pedalboard offers the ports
 * of its pedals that are not cabled on the board.
 */
function portsOf(project: Project, deviceId: string): Candidate[] {
  const device = project.devices.find((d) => d.id === deviceId);
  const template = device && project.templates[device.templateId];
  if (!device || !template) return [];
  if (template.category === 'pedalboard') {
    return exposedPorts(project, device.id).map((e, index) => ({ deviceId: e.deviceId, port: e.port, index }));
  }
  return template.ports.map((port, index) => ({ deviceId: device.id, port, index }));
}

const BAD_OUTPUT = /send|aux|phones|headphone|insert|talkback|thru|through|link|control room|monitor/i;
const GOOD_OUTPUT = /main|line out|output|^out/i;
const BAD_INPUT = /return|insert|talkback|2-track|tape|cue/i;

/**
 * How good a cable from `a` (sending) to `b` (receiving) would be, or null if
 * it makes no sense. Uses the normal connection checks, then prefers matching
 * signals, main outputs and low-numbered ports.
 */
function score(project: Project, a: Candidate, b: Candidate): number | null {
  if (a.port.direction === 'in' || b.port.direction === 'out') return null;
  if (isPowerSignal(a.port.signal) !== isPowerSignal(b.port.signal)) return null;
  const ends: [CableEnd, CableEnd] = [
    { deviceId: a.deviceId, portId: a.port.id },
    { deviceId: b.deviceId, portId: b.port.id },
  ];
  const issues = checkCable(project, { id: 'probe', label: '', ends });
  const worst = worstSeverity(issues);
  if (worst === 'error') return null;
  let s = worst === 'warning' ? 40 : worst === 'info' ? 75 : 100;
  if (a.port.signal === b.port.signal || b.port.alsoAccepts?.includes(a.port.signal)) s += 25;
  if (BAD_OUTPUT.test(a.port.label)) s -= 20;
  else if (GOOD_OUTPUT.test(a.port.label)) s += 5;
  // Returns and inserts belong to effect loops; those are wired on purpose, never automatically.
  if (BAD_INPUT.test(b.port.label)) return null;
  return s - (a.index + b.index) * 0.01;
}

/** The other half of a stereo pair ("Out L" -> "Out R", "Input 1" -> "Input 2"), if any. */
function stereoPartner(ports: Candidate[], c: Candidate): Candidate | undefined {
  const label = c.port.label;
  const lr = label.match(/^(.*?)(\s*)(L|Left)$/);
  if (lr) {
    const want = new Set([`${lr[1]}${lr[2]}R`, `${lr[1]}${lr[2]}Right`]);
    return ports.find((p) => p.deviceId === c.deviceId && want.has(p.port.label));
  }
  const num = label.match(/^(.*?)(\d+)$/);
  if (num && Number(num[2]) % 2 === 1) {
    const want = `${num[1]}${Number(num[2]) + 1}`;
    return ports.find((p) => p.deviceId === c.deviceId && p.port.label === want);
  }
  return undefined;
}

const key = (c: Candidate) => `${c.deviceId}/${c.port.id}`;

/**
 * Connects device `fromId` to device `toId` with the best free ports. Adds a
 * second cable for the right channel when both sides have a stereo pair.
 * Returns null if nothing fits.
 */
export function connectDevices(project: Project, fromId: string, toId: string): { project: Project; added: string[] } | null {
  const used = computeOccupancy(project);
  const free = (c: Candidate) => !used.get(key(c));
  const outs = portsOf(project, fromId).filter((c) => c.port.direction !== 'in');
  const ins = portsOf(project, toId).filter((c) => c.port.direction !== 'out');
  // Do not connect two devices twice for the same kind of signal.
  const alreadyLinked = project.cables.some((cable) => {
    const ids = cable.ends.map((e) => e.deviceId);
    return outs.some((o) => ids.includes(o.deviceId)) && ins.some((i) => ids.includes(i.deviceId));
  });
  if (alreadyLinked) return null;

  let best: { a: Candidate; b: Candidate; s: number } | null = null;
  for (const a of outs.filter(free)) {
    for (const b of ins.filter(free)) {
      if (a.deviceId === b.deviceId) continue;
      const s = score(project, a, b);
      if (s !== null && s >= MIN_SCORE && (!best || s > best.s)) best = { a, b, s };
    }
  }
  if (!best) return null;

  const pairs: [Candidate, Candidate][] = [[best.a, best.b]];
  const ra = stereoPartner(outs, best.a);
  const rb = stereoPartner(ins, best.b);
  if (ra && rb && free(ra) && free(rb) && score(project, ra, rb) !== null) pairs.push([ra, rb]);

  let next = project;
  const added: string[] = [];
  for (const [a, b] of pairs) {
    const r = addCable(next, { deviceId: a.deviceId, portId: a.port.id }, { deviceId: b.deviceId, portId: b.port.id });
    next = r.project;
    added.push(r.cable.id);
  }
  return { project: next, added };
}

/**
 * "Draw a chain": connects the devices one after the other, in the order the
 * line passed through them.
 */
export function connectChain(project: Project, deviceIds: string[]): WiringResult {
  let next = project;
  const added: string[] = [];
  const failed: [string, string][] = [];
  for (let k = 0; k + 1 < deviceIds.length; k++) {
    const r = connectDevices(next, deviceIds[k], deviceIds[k + 1]);
    if (r) {
      next = r.project;
      added.push(...r.added);
    } else {
      failed.push([deviceIds[k], deviceIds[k + 1]]);
    }
  }
  return { project: next, added, failed };
}

// ---------- Suggest wiring for a whole setup ----------

/** Where a device's signal usually goes next, in order of preference. */
interface TargetRule {
  categories: DeviceCategory[];
  /** Connect to every device of the first matching category (e.g. both monitors). */
  all?: boolean;
  /** Skip this rule when the setup contains a device of this category. */
  unless?: DeviceCategory;
}

const RULES: Partial<Record<DeviceCategory, TargetRule[]>> = {
  instrument: [{ categories: ['pedal', 'pedalboard', 'amp', 'di-box', 'preamp', 'interface', 'mixer'] }],
  microphone: [{ categories: ['preamp', 'mixer', 'interface'] }],
  pedal: [{ categories: ['pedal', 'amp', 'di-box', 'interface', 'mixer'] }],
  pedalboard: [{ categories: ['amp', 'di-box', 'interface', 'mixer'] }],
  'di-box': [{ categories: ['preamp', 'mixer', 'interface'] }],
  preamp: [{ categories: ['interface', 'mixer'] }],
  outboard: [{ categories: ['interface', 'mixer'] }],
  amp: [{ categories: ['mixer', 'interface'] }],
  mixer: [
    { categories: ['interface'] },
    { categories: ['monitor'], all: true, unless: 'interface' },
    { categories: ['headphones'], all: true, unless: 'interface' },
  ],
  interface: [{ categories: ['computer'] }, { categories: ['monitor'], all: true }, { categories: ['headphones'], all: true }],
};

/** Signal-flow order, so sources are wired before the devices they feed. */
const RANK: Partial<Record<DeviceCategory, number>> = {
  instrument: 0,
  microphone: 0,
  pedal: 1,
  pedalboard: 1,
  'di-box': 2,
  preamp: 2,
  amp: 2,
  outboard: 3,
  mixer: 4,
  interface: 5,
  computer: 6,
  monitor: 7,
  headphones: 7,
};

/**
 * Suggests cables for all given devices (usually the ones on screen): every
 * device is connected to where its signal typically goes next. Existing cables
 * are kept and taken into account. Only a theoretical, sensible proposal.
 */
export function suggestWiring(project: Project, deviceIds: string[]): WiringResult {
  const devices = deviceIds
    .map((id) => project.devices.find((d) => d.id === id))
    .filter((d): d is DeviceInstance => !!d);
  const category = (d: DeviceInstance) => project.templates[d.templateId]?.category ?? 'other';
  const present = new Set(devices.map(category));
  const dist = (a: DeviceInstance, b: DeviceInstance) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
  const order = [...devices].sort(
    (a, b) => (RANK[category(a)] ?? 9) - (RANK[category(b)] ?? 9) || a.position.x - b.position.x || a.position.y - b.position.y,
  );

  let next = project;
  const added: string[] = [];
  const failed: [string, string][] = [];
  // A device "has input" once something feeds it; pedals only chain into pedals that are not fed yet.
  const hasInput = (p: Project, d: DeviceInstance) =>
    p.cables.some((c) => c.ends[1].deviceId === d.id || (category(d) === 'pedalboard' && devicesOn(p, d.id).has(c.ends[1].deviceId)));

  for (const source of order) {
    const rules = RULES[category(source)] ?? [];
    for (const rule of rules) {
      if (rule.unless && present.has(rule.unless)) continue;
      for (const cat of rule.categories) {
        let targets = devices.filter((t) => t.id !== source.id && category(t) === cat);
        // Same-stage chaining (pedal -> pedal) only into pedals nothing feeds yet, to avoid loops.
        if (cat === category(source) || cat === 'pedal' || cat === 'pedalboard') targets = targets.filter((t) => !hasInput(next, t));
        if (targets.length === 0) continue;
        targets.sort((a, b) => (rule.all ? a.position.x - b.position.x || a.position.y - b.position.y : dist(source, a) - dist(source, b)));
        let connected = false;
        for (const target of targets) {
          const r = connectDevices(next, source.id, target.id);
          if (r) {
            next = r.project;
            added.push(...r.added);
            connected = true;
            if (!rule.all) break;
          }
        }
        if (connected) break;
        // Nothing free in this category: try the next one in the rule.
      }
    }
  }
  return { project: next, added, failed };
}

function devicesOn(project: Project, boardId: string): Set<string> {
  return new Set(project.devices.filter((d) => d.containerId === boardId).map((d) => d.id));
}
