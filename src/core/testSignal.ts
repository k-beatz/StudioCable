import { controlValue, switchedOff } from './controls';
import { KNOB_MAX, type DeviceTemplate, type Project } from './model';
import { getPort } from './project';
import { traceFromDevice, type SignalPath } from './signalFlow';
import { checkCable, type IssueCode } from './validation';

/**
 * A test signal sent from one device through the plan. Works out who hears
 * it (speakers, headphones, a guitar combo) or records it (a computer), how
 * loud, on which side, and how it is spoiled on the way: a mic into a line
 * input is faint, a line signal into a mic input distorts, a turntable
 * without a phono stage is faint and thin, swapped speaker polarity cancels
 * the bass. Pure functions; the UI turns the result into sound.
 */

export type Effect = 'quiet' | 'distorted' | 'thin' | 'dull' | 'phase';

export interface TestListener {
  deviceId: string;
  kind: 'speaker' | 'headphones' | 'recorder';
  /** 1 = everything at its normal setting; above 1 = turned up, clips from CLIP_LEVEL on. */
  level: number;
  /** -1 left, 0 centre/both, 1 right. */
  pan: number;
  effects: Effect[];
}

/** Where the signal dies on its way. */
export interface TestStop {
  cableId?: string;
  deviceId: string;
  reason: IssueCode | 'switchedOff';
}

export interface TestResult {
  sourceId: string;
  listeners: TestListener[];
  stops: TestStop[];
  /** Cables the signal actually runs through. */
  cableIds: Set<string>;
  deviceIds: Set<string>;
}

/** From this level on a turned-up chain overloads and distorts. */
export const CLIP_LEVEL = 2.5;

/** What a doubtful connection does to the sound (and how much of the level is left). */
const SPOILERS: Partial<Record<IssueCode, { effects: Effect[]; gain: number }>> = {
  micIntoLine: { effects: ['quiet'], gain: 0.15 },
  phonoNeedsPreamp: { effects: ['quiet', 'thin'], gain: 0.08 },
  lineIntoPhono: { effects: ['distorted'], gain: 2 },
  lineIntoMic: { effects: ['distorted'], gain: 2 },
  lineIntoSpeaker: { effects: ['quiet'], gain: 0.05 },
  instrumentNeedsDi: { effects: ['dull'], gain: 0.7 },
  polaritySwapped: { effects: ['phase'], gain: 1 },
};
/** Connections that let nothing through. */
const BLOCKERS = new Set<IssueCode>(['phantomOff']);

function listenerKind(template: DeviceTemplate): TestListener['kind'] | undefined {
  if (template.category === 'monitor') return 'speaker';
  if (template.category === 'headphones') return 'headphones';
  if (template.category === 'computer') return 'recorder';
  // A guitar combo has its own speaker; an amp with speaker outputs drives external ones instead.
  if (template.category === 'amp' && !template.ports.some((p) => p.direction === 'out' && p.signal === 'speaker')) return 'speaker';
  return undefined;
}

const LEFT = /(^|[\s_\-/(])(l|left|links)($|[\s_\-/)\d])/i;
const RIGHT = /(^|[\s_\-/(])(r|right|rechts)($|[\s_\-/)\d])/i;
const sideOf = (text: string) => (LEFT.test(text) ? -1 : RIGHT.test(text) ? 1 : 0);

export function testSignal(project: Project, sourceId: string): TestResult {
  const result: TestResult = { sourceId, listeners: [], stops: [], cableIds: new Set(), deviceIds: new Set([sourceId]) };
  const source = project.devices.find((d) => d.id === sourceId);
  if (!source) return result;
  const byDevice = new Map<string, TestListener>();

  for (const path of traceFromDevice(project, source).downstream) follow(project, path, result, byDevice);
  result.listeners = [...byDevice.values()];
  const seen = new Set<string>();
  result.stops = result.stops.filter((s) => {
    const key = `${s.cableId}/${s.reason}`;
    return !seen.has(key) && !!seen.add(key);
  });
  return result;
}

function follow(project: Project, path: SignalPath, result: TestResult, byDevice: Map<string, TestListener>) {
  let level = 1;
  const effects = new Set<Effect>();
  const counted = new Set<string>();

  for (let i = 0; i < path.ports.length; i++) {
    const here = path.ports[i];
    const device = project.devices.find((d) => d.id === here.deviceId);
    const template = device && project.templates[device.templateId];
    if (!device || !template) return;

    // Level and gain knobs on the way: 5 is the normal setting, 10 twice as loud.
    for (const c of template.controls ?? []) {
      const key = `${device.id}/${c.id}`;
      if (c.kind !== 'knob' || !(c.levelOf?.includes(here.portId) || c.gainOf?.includes(here.portId)) || counted.has(key)) continue;
      counted.add(key);
      level *= Number(controlValue(c, device)) / (KNOB_MAX / 2);
    }

    const kind = i > 0 ? listenerKind(template) : undefined;
    if (kind && level > 0) {
      const port = getPort(project, here);
      const side =
        kind === 'headphones'
          ? 0
          : sideOf(device.name) ||
            sideOf(port?.label ?? '') ||
            sideOf(
              path.ports
                .slice(0, i)
                .map((p) => getPort(project, p)?.label ?? '')
                .reverse()
                .find((l) => sideOf(l) !== 0) ?? '',
            );
      const fx = new Set(effects);
      if (level >= CLIP_LEVEL) fx.add('distorted');
      const old = byDevice.get(device.id);
      if (!old || level > old.level) byDevice.set(device.id, { deviceId: device.id, kind, level, pan: side, effects: [...fx] });
      result.deviceIds.add(device.id);
    }

    const link = path.links[i];
    if (!link) return;
    if (link.kind === 'internal') continue;
    const cable = project.cables.find((c) => c.id === link.cableId);
    if (!cable) return;
    const off = switchedOff(template, device, here.portId);
    if (off) {
      result.stops.push({ cableId: cable.id, deviceId: device.id, reason: 'switchedOff' });
      return;
    }
    const issues = checkCable(project, cable);
    const dead = issues.find((x) => x.severity === 'error' || BLOCKERS.has(x.code));
    if (dead) {
      result.stops.push({ cableId: cable.id, deviceId: path.ports[i + 1].deviceId, reason: dead.code });
      return;
    }
    for (const issue of issues) {
      const spoil = SPOILERS[issue.code];
      if (!spoil) continue;
      level *= spoil.gain;
      for (const e of spoil.effects) effects.add(e);
    }
    result.cableIds.add(cable.id);
    result.deviceIds.add(path.ports[i + 1].deviceId);
  }
}
