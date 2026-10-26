import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../library';
import { applySettings, diagnose } from './diagnose';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { libraryToTemplate, validateLibraryDevice, type LibraryDevice } from './library';
import type { DeviceTemplate, Project } from './model';
import { addCable, addDevice, createProject, updateDevice } from './project';
import { traceFromPort } from './signalFlow';
import { checkCable } from './validation';

const audio2 = () => libraryToTemplate(LIBRARY.find((d) => d.id === 'swissonic-audio-2')!);
const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

/** Mic -> Audio 2 CH1 (or CH2), Audio 2 main outs -> two speakers, USB -> computer. */
function studio(micKey = 'dynamicMic', input = 'CH1') {
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
  const connect = (a: ReturnType<typeof port>, b: ReturnType<typeof port>) => (p = addCable(p, a, b).project);
  const mic = add(preset(micKey), 'Mic');
  const iface = add(audio2(), 'Audio 2');
  const left = add(preset('activeMonitor'), 'Left');
  const right = add(preset('activeMonitor'), 'Right');
  const pc = add(preset('computer'), 'Computer');
  connect(port(mic, 'Out'), port(iface, input));
  connect(port(iface, 'MAIN OUTPUTS LEFT'), port(left, 'Input'));
  connect(port(iface, 'MAIN OUTPUTS RIGHT'), port(right, 'Input'));
  connect(port(iface, 'USB TO PC'), port(pc, 'USB 1'));
  const set = (settings: Record<string, string | number>) => (p = updateDevice(p, iface, { settings }));
  return { get p() { return p; }, mic, iface, left, right, pc, set, port };
}

const reaches = (s: ReturnType<typeof studio>, deviceId: string) =>
  traceFromPort(s.p, s.port(s.mic, 'Out')).deviceIds.has(deviceId);

describe('knobs and switches', () => {
  it('the Audio 2 library entry is valid and brings its controls', () => {
    const entry = LIBRARY.find((d) => d.id === 'swissonic-audio-2')!;
    expect(validateLibraryDevice(entry)).toEqual([]);
    const t = audio2();
    expect(t.controls?.map((c) => c.id)).toEqual(['gain1', 'gain2', 'hiz', 'phan', 'monitoring', 'mode', 'phones', 'main']);
    const phan = t.controls!.find((c) => c.id === 'phan')!;
    expect(phan.phantomFor?.map((id) => t.ports.find((p) => p.id === id)!.label)).toEqual(['CH1', 'CH2']);
  });

  it('in the default position the mic reaches both the speakers and the computer', () => {
    const s = studio();
    expect(reaches(s, s.left)).toBe(true);
    expect(reaches(s, s.pc)).toBe(true);
    // Stereo: CH1 goes left only.
    expect(reaches(s, s.right)).toBe(false);
  });

  it('MONO puts CH1 on both outputs', () => {
    const s = studio();
    s.set({ mode: 'MONO' });
    expect(reaches(s, s.right)).toBe(true);
  });

  it('MONITORING fully on DAW cuts the direct path, but not the way to the computer', () => {
    const s = studio();
    s.set({ monitoring: 10 });
    expect(reaches(s, s.left)).toBe(false);
    expect(reaches(s, s.pc)).toBe(true);
  });

  it('troubleshooting names the knob and the fix opens the path', () => {
    const s = studio();
    s.set({ monitoring: 10 });
    const d = diagnose(s.p, s.mic, s.left);
    expect(d.arrives).toBe(false);
    expect(d.problem).toBe('setting');
    expect(d.stuckAt).toBe(s.iface);
    expect(d.settings).toEqual([{ deviceId: s.iface, controlId: 'monitoring', label: 'MONITORING', from: 10, to: 5 }]);
    expect(diagnose(applySettings(s.p, d.settings!), s.mic, s.left).arrives).toBe(true);
  });

  it('MAIN OUTPUT at MIN silences the speakers', () => {
    const s = studio();
    s.set({ main: 0 });
    const d = diagnose(s.p, s.mic, s.left);
    expect(d.problem).toBe('setting');
    expect(d.settings?.[0]).toMatchObject({ controlId: 'main', from: 0 });
  });

  it('a condenser mic needs PHAN switched on', () => {
    const s = studio('condenserMic');
    const cable = s.p.cables[0];
    expect(checkCable(s.p, cable).map((i) => i.code)).toContain('phantomOff');
    const d = diagnose(s.p, s.mic, s.pc);
    expect(d.problem).toBe('setting');
    expect(d.settings).toEqual([{ deviceId: s.iface, controlId: 'phan', label: 'PHAN +48 V', from: 'OFF', to: 'ON' }]);

    s.set({ phan: 'ON' });
    expect(checkCable(s.p, s.p.cables[0]).map((i) => i.code)).not.toContain('phantomOff');
    expect(diagnose(s.p, s.mic, s.pc).arrives).toBe(true);
  });

  it('a dynamic mic does not care about phantom power', () => {
    const s = studio('dynamicMic');
    expect(checkCable(s.p, s.p.cables[0]).map((i) => i.code)).not.toContain('phantomOff');
    expect(diagnose(s.p, s.mic, s.pc).arrives).toBe(true);
  });

  it('library check catches broken controls', () => {
    const base = LIBRARY.find((d) => d.id === 'swissonic-audio-2')!;
    const broken: LibraryDevice = {
      ...base,
      controls: [{ id: 'x', label: 'X', kind: 'switch', positions: ['A', 'B'], default: 'C' }],
      routing: [{ from: 'CH1', to: 'PHONES', when: [{ control: 'nope', is: ['A'] }] }],
    };
    const errors = validateLibraryDevice(broken).join('\n');
    expect(errors).toContain('default must be one of the positions');
    expect(errors).toContain('unknown control "nope"');
  });

  it('per-channel controls and routes ("count" with {n}) expand and work', () => {
    const mixer: LibraryDevice = {
      format: 'studiocable-device',
      schemaVersion: 1,
      id: 'test-mini-mixer',
      manufacturer: 'Test',
      model: 'Mini',
      category: 'mixer',
      status: 'unverified',
      sources: [{ url: 'https://example.com' }],
      groups: [
        { count: 2, label: 'IN', direction: 'in', connectors: [{ type: 'xlr', gender: 'female' }], signal: 'mic' },
        { count: 0, label: '', labels: ['MAIN L'], direction: 'out', connectors: [{ type: 'trs-6.3', gender: 'female' }], signal: 'line-bal' },
      ],
      controls: [
        { id: 'level{n}', label: 'LEVEL', kind: 'knob', default: 5, count: 2, section: 'CH {n}', levelOf: ['IN {n}'] },
        { id: 'mute{n}', label: 'MUTE', kind: 'switch', positions: ['OFF', 'ON'], default: 'OFF', count: 2, section: 'CH {n}' },
      ],
      routing: [{ count: 2, from: 'IN {n}', to: 'MAIN L', when: [{ control: 'mute{n}', is: ['OFF'] }] }],
    };
    expect(validateLibraryDevice(mixer)).toEqual([]);
    const t = libraryToTemplate(mixer);
    expect(t.controls?.map((c) => `${c.section}/${c.id}`)).toEqual(['CH 1/level1', 'CH 2/level2', 'CH 1/mute1', 'CH 2/mute2']);
    expect(t.routing?.map((r) => r.when?.[0].control)).toEqual(['mute1', 'mute2']);
    const label = (id: string) => t.ports.find((p) => p.id === id)!.label;
    expect(t.controls?.find((c) => c.id === 'level2')?.levelOf?.map(label)).toEqual(['IN 2']);
    // A typo in a per-channel reference is still caught.
    expect(validateLibraryDevice({ ...mixer, routing: [{ count: 2, from: 'IN {n}', to: 'MAIN L', when: [{ control: 'mut{n}', is: ['OFF'] }] }] }).join()).toContain('unknown control "mut1"');
  });

  it('a mic with its on/off switch off sends nothing; troubleshooting switches it on', () => {
    const mic: LibraryDevice = {
      format: 'studiocable-device',
      schemaVersion: 1,
      id: 'test-switch-mic',
      manufacturer: 'Test',
      model: 'Switch Mic',
      category: 'microphone',
      status: 'unverified',
      sources: [{ url: 'https://example.com' }],
      groups: [{ count: 0, label: '', labels: ['Out'], direction: 'out', connectors: [{ type: 'xlr', gender: 'male' }], signal: 'mic' }],
      controls: [{ id: 'onoff', label: 'ON/OFF', kind: 'switch', positions: ['ON', 'OFF'], default: 'ON', onFor: ['Out'] }],
    };
    expect(validateLibraryDevice(mic)).toEqual([]);
    let p: Project = createProject();
    const m = addDevice(p, libraryToTemplate(mic), 'Mic', { x: 0, y: 0 });
    p = m.project;
    const iface = addDevice(p, audio2(), 'Audio 2', { x: 300, y: 0 });
    p = iface.project;
    const micPort = p.templates[m.device.templateId].ports[0].id;
    const ch1 = p.templates[iface.device.templateId].ports.find((x) => x.label === 'CH1')!.id;
    p = addCable(p, { deviceId: m.device.id, portId: micPort }, { deviceId: iface.device.id, portId: ch1 }).project;
    expect(diagnose(p, m.device.id, iface.device.id).arrives).toBe(true);
    p = updateDevice(p, m.device.id, { settings: { onoff: 'OFF' } });
    const d = diagnose(p, m.device.id, iface.device.id);
    expect(d.problem).toBe('setting');
    expect(d.settings).toEqual([{ deviceId: m.device.id, controlId: 'onoff', label: 'ON/OFF', from: 'OFF', to: 'ON' }]);
  });
});
