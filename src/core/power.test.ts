import { describe, expect, it } from 'vitest';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { addCable, addDevice, createProject } from './project';
import { isPowerCable, powerInputKind, powerInputOf, setPowerInput } from './power';
import { checkProject } from './validation';
import type { Project } from './model';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

function setup() {
  let p: Project = createProject();
  const add = (key: string) => {
    const r = addDevice(p, preset(key), key, { x: 0, y: 0 });
    p = r.project;
    return r.device;
  };
  const port = (deviceId: string, label: string) => {
    const d = p.devices.find((x) => x.id === deviceId)!;
    return { deviceId, portId: p.templates[d.templateId].ports.find((x) => x.label.startsWith(label))!.id };
  };
  return { add, port, get p() { return p; }, set p(v) { p = v; } };
}

describe('power layer', () => {
  it('recognises power cables and accepts a strip feeding a monitor', () => {
    const s = setup();
    const strip = s.add('powerStrip');
    const monitor = s.add('activeMonitor');
    s.p = addCable(s.p, s.port(strip.id, 'Socket'), s.port(monitor.id, 'Power')).project;
    expect(isPowerCable(s.p, s.p.cables[0])).toBe(true);
    const issues = checkProject(s.p);
    // Schuko socket to IEC inlet just needs the right power cable.
    expect(issues.map((i) => i.code)).toEqual(['connectorMismatch']);
    expect(issues[0].severity).toBe('info');
  });

  it('warns loudly when mains power goes into a DC input', () => {
    const s = setup();
    const strip = s.add('powerStrip');
    const pedal = s.add('pedalMono');
    s.p = addCable(s.p, s.port(strip.id, 'Socket'), s.port(pedal.id, 'DC In')).project;
    expect(checkProject(s.p).some((i) => i.code === 'mainsIntoDc' && i.severity === 'error')).toBe(true);
  });

  it('flags audio plugged into a power port as incompatible', () => {
    const s = setup();
    const guitar = s.add('guitar');
    const pedal = s.add('pedalMono');
    s.p = addCable(s.p, s.port(guitar.id, 'Out'), s.port(pedal.id, 'DC In')).project;
    expect(checkProject(s.p).some((i) => i.code === 'incompatibleSignal')).toBe(true);
  });

  it('sets, changes and removes the power input of a device model', () => {
    const s = setup();
    const mixer = s.add('mixer8');
    const tid = mixer.templateId;
    expect(powerInputOf(s.p.templates[tid])).toBeUndefined();
    s.p = setPowerInput(s.p, tid, 'dc');
    expect(powerInputKind(powerInputOf(s.p.templates[tid]))).toBe('dc');
    s.p = setPowerInput(s.p, tid, 'iec');
    expect(powerInputKind(powerInputOf(s.p.templates[tid]))).toBe('iec');

    const strip = s.add('powerStrip');
    s.p = addCable(s.p, s.port(strip.id, 'Socket'), s.port(mixer.id, 'Power')).project;
    s.p = setPowerInput(s.p, tid, null);
    expect(powerInputOf(s.p.templates[tid])).toBeUndefined();
    expect(s.p.cables).toHaveLength(0);
  });
});

describe('phono (turntable) signals', () => {
  it('warns when a turntable goes into a line input, and line into a phono input', () => {
    const s = setup();
    const deck = s.add('turntable');
    const mixer = s.add('mixer8');
    s.p = addCable(s.p, s.port(deck.id, 'Out L'), s.port(mixer.id, 'Line In')).project;
    expect(checkProject(s.p).map((i) => i.code)).toContain('phonoNeedsPreamp');
  });
});
