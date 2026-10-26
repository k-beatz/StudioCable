import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../library';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { libraryToTemplate } from './library';
import type { DeviceTemplate, Project } from './model';
import { addCable, addDevice, createProject, updateCable, updateDevice } from './project';
import { CLIP_LEVEL, testSignal } from './testSignal';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);
const lib = (id: string) => libraryToTemplate(LIBRARY.find((d) => d.id === id)!);

function plan() {
  let p: Project = createProject();
  const add = (t: DeviceTemplate, name: string) => {
    const r = addDevice(p, t, name, { x: 0, y: 0 });
    p = r.project;
    return r.device.id;
  };
  const port = (deviceId: string, label: string) => {
    const d = p.devices.find((x) => x.id === deviceId)!;
    return { deviceId, portId: p.templates[d.templateId].ports.find((x) => x.label === label)!.id };
  };
  const connect = (a: ReturnType<typeof port>, b: ReturnType<typeof port>) => {
    const r = addCable(p, a, b);
    p = r.project;
    return r.cable.id;
  };
  const set = (id: string, settings: Record<string, string | number>) => (p = updateDevice(p, id, { settings }));
  return { get p() { return p; }, set p(v) { p = v; }, add, port, connect, set };
}

/** Mic -> Audio 2 CH1 -> speakers Left/Right and the computer. */
function studio(micKey = 'dynamicMic') {
  const s = plan();
  const mic = s.add(preset(micKey), 'Mic');
  const iface = s.add(lib('swissonic-audio-2'), 'Audio 2');
  const left = s.add(preset('activeMonitor'), 'Left');
  const right = s.add(preset('activeMonitor'), 'Right');
  const pc = s.add(preset('computer'), 'Computer');
  s.connect(s.port(mic, 'Out'), s.port(iface, 'CH1'));
  s.connect(s.port(iface, 'MAIN OUTPUTS LEFT'), s.port(left, 'Input'));
  s.connect(s.port(iface, 'MAIN OUTPUTS RIGHT'), s.port(right, 'Input'));
  s.connect(s.port(iface, 'USB TO PC'), s.port(pc, 'USB 1'));
  return { ...s, get p() { return s.p; }, mic, iface, left, right, pc };
}

/** Turntable -> Denon (PHONO or CD) -> passive speakers. */
function hifi(input: 'PHONO' | 'CD') {
  const s = plan();
  const tt = s.add(preset('turntable'), 'Turntable');
  const amp = s.add(lib('denon-pma-510ae'), 'Amp');
  const left = s.add(preset('passiveSpeaker'), 'Left');
  const right = s.add(preset('passiveSpeaker'), 'Right');
  s.connect(s.port(tt, 'Out L'), s.port(amp, `${input} L`));
  s.connect(s.port(tt, 'Out R'), s.port(amp, `${input} R`));
  s.connect(s.port(amp, 'SPEAKERS A L'), s.port(left, 'Speaker In'));
  const rightCable = s.connect(s.port(amp, 'SPEAKERS A R'), s.port(right, 'Speaker In'));
  s.set(amp, { input });
  return { ...s, get p() { return s.p; }, set p(v) { s.p = v; }, tt, amp, left, right, rightCable };
}

describe('test signal', () => {
  it('a mic in stereo mode is heard on the left speaker only, and recorded by the computer', () => {
    const s = studio();
    const r = testSignal(s.p, s.mic);
    const byId = new Map(r.listeners.map((l) => [l.deviceId, l]));
    expect(byId.get(s.left)).toMatchObject({ kind: 'speaker', pan: -1, effects: [] });
    expect(byId.has(s.right)).toBe(false);
    expect(byId.get(s.pc)?.kind).toBe('recorder');
    expect(r.stops).toEqual([]);
  });

  it('knobs change the level; everything turned up clips', () => {
    const s = studio();
    const normal = testSignal(s.p, s.mic).listeners.find((l) => l.deviceId === s.left)!.level;
    s.set(s.iface, { main: 2 });
    const low = testSignal(s.p, s.mic).listeners.find((l) => l.deviceId === s.left)!.level;
    expect(low).toBeLessThan(normal);
    s.set(s.iface, { gain1: 10, main: 10 });
    const loud = testSignal(s.p, s.mic).listeners.find((l) => l.deviceId === s.left)!;
    expect(loud.level).toBeGreaterThanOrEqual(CLIP_LEVEL);
    expect(loud.effects).toContain('distorted');
  });

  it('a condenser mic without phantom power is silent and says why', () => {
    const s = studio('condenserMic');
    const r = testSignal(s.p, s.mic);
    expect(r.listeners).toEqual([]);
    expect(r.stops).toEqual([expect.objectContaining({ deviceId: s.iface, reason: 'phantomOff' })]);
    s.set(s.iface, { phan: 'ON' });
    expect(testSignal(s.p, s.mic).listeners.length).toBeGreaterThan(0);
  });

  it('a turntable on PHONO sounds normal on both speakers', () => {
    const h = hifi('PHONO');
    const r = testSignal(h.p, h.tt);
    expect(r.listeners.map((l) => [l.pan, l.effects]).sort()).toEqual([
      [-1, []],
      [1, []],
    ]);
  });

  it('a turntable on a line input is faint and thin', () => {
    const h = hifi('CD');
    const left = testSignal(h.p, h.tt).listeners.find((l) => l.deviceId === h.left)!;
    expect(left.effects).toEqual(['quiet', 'thin']);
    expect(left.level).toBeLessThan(0.2);
  });

  it('swapped speaker polarity shows up as a phase problem on that speaker', () => {
    const h = hifi('PHONO');
    h.p = updateCable(h.p, h.rightCable, { polarity: 'swapped' });
    const r = testSignal(h.p, h.tt);
    expect(r.listeners.find((l) => l.deviceId === h.right)?.effects).toEqual(['phase']);
    expect(r.listeners.find((l) => l.deviceId === h.left)?.effects).toEqual([]);
  });

  it('Cambridge CXA81: the selected source plays; plugging in headphones mutes the speakers', () => {
    const s = plan();
    const synth = s.add(preset('synth'), 'Synth');
    const amp = s.add(lib('cambridge-audio-cxa81'), 'CXA81');
    const left = s.add(preset('passiveSpeaker'), 'Left');
    const right = s.add(preset('passiveSpeaker'), 'Right');
    s.connect(s.port(synth, 'Out L'), s.port(amp, 'A2 L'));
    s.connect(s.port(synth, 'Out R'), s.port(amp, 'A2 R'));
    s.connect(s.port(amp, 'SPEAKERS A L'), s.port(left, 'Speaker In'));
    s.connect(s.port(amp, 'SPEAKERS A R'), s.port(right, 'Speaker In'));
    const heard = () => testSignal(s.p, synth).listeners.map((l) => l.deviceId).sort();
    expect(heard()).toEqual([]); // the CXA81 starts on A1
    s.set(amp, { input: 'A2' });
    expect(heard()).toEqual([left, right].sort());
    const phones = s.add(preset('headphones'), 'Phones');
    const plug = s.p.templates[s.p.devices.find((d) => d.id === phones)!.templateId].ports[0].label;
    s.connect(s.port(amp, 'PHONES'), s.port(phones, plug));
    expect(heard()).toEqual([phones]);
  });
});
