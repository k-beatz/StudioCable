import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../library';
import { applySettings, diagnose } from './diagnose';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { libraryToTemplate, validateLibraryDevice } from './library';
import type { DeviceTemplate, Project } from './model';
import { addCable, addDevice, createProject, updateCable, updateDevice } from './project';
import { checkCable } from './validation';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

/** Turntable -> Denon PHONO, passive speakers on SPEAKERS A (or B) with plain speaker wire. */
function hifi(speakers: 'A' | 'B' = 'A') {
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
  const tt = add(preset('turntable'), 'Turntable');
  const amp = add(libraryToTemplate(LIBRARY.find((d) => d.id === 'denon-pma-510ae')!), 'Amp');
  const left = add(preset('passiveSpeaker'), 'Left');
  const right = add(preset('passiveSpeaker'), 'Right');
  p = addCable(p, port(tt, 'Out L'), port(amp, 'PHONO L')).project;
  p = addCable(p, port(tt, 'Out R'), port(amp, 'PHONO R')).project;
  p = addCable(p, port(amp, `SPEAKERS ${speakers} L`), port(left, 'Speaker In')).project;
  p = addCable(p, port(amp, `SPEAKERS ${speakers} R`), port(right, 'Speaker In')).project;
  const set = (settings: Record<string, string | number>) => (p = updateDevice(p, amp, { settings }));
  return { get p() { return p; }, set: set, tt, amp, left, right };
}

describe('Denon PMA-510AE with passive speakers', () => {
  it('library entry is valid', () => {
    expect(validateLibraryDevice(LIBRARY.find((d) => d.id === 'denon-pma-510ae'))).toEqual([]);
  });

  it('the wrong input is selected: troubleshooting switches to PHONO', () => {
    const h = hifi();
    const d = diagnose(h.p, h.tt, h.left);
    expect(d.problem).toBe('setting');
    expect(d.settings).toEqual([{ deviceId: h.amp, controlId: 'input', label: 'INPUT SELECTOR', from: 'CD', to: 'PHONO' }]);
    expect(diagnose(applySettings(h.p, d.settings!), h.tt, h.left).arrives).toBe(true);
  });

  it('speakers on B need SPEAKERS B switched on', () => {
    const h = hifi('B');
    h.set({ input: 'PHONO' });
    const d = diagnose(h.p, h.tt, h.right);
    expect(d.settings?.map((s) => `${s.controlId}:${s.to}`)).toEqual(['speakerB:ON']);
    h.set({ input: 'PHONO', speakerB: 'ON' });
    expect(diagnose(h.p, h.tt, h.right).arrives).toBe(true);
  });

  it('muting and volume at MIN silence the speakers', () => {
    const h = hifi();
    h.set({ input: 'PHONO', mute: 'ON' });
    expect(diagnose(h.p, h.tt, h.left).settings?.[0]).toMatchObject({ controlId: 'mute', to: 'OFF' });
    h.set({ input: 'PHONO', volume: 0 });
    expect(diagnose(h.p, h.tt, h.left).settings?.[0]).toMatchObject({ controlId: 'volume', from: 0 });
  });

  it('speaker wire fits screw terminals and spring clips; crossed polarity is a warning', () => {
    const h = hifi();
    const speakerCable = h.p.cables[2];
    const codes = () => checkCable(h.p, h.p.cables[2]).map((i) => i.code);
    expect(codes()).toContain('speakerWire');
    expect(codes()).not.toContain('connectorMismatch');
    const p2 = updateCable(h.p, speakerCable.id, { polarity: 'swapped' });
    expect(checkCable(p2, p2.cables[2]).map((i) => i.code)).toEqual(['polaritySwapped']);
  });
});

describe('suggest wiring for a hi-fi amp', () => {
  it('connects turntable -> phono and the amp to both passive speakers', async () => {
    const { suggestWiring } = await import('./autowire');
    let p: Project = createProject();
    const ids: string[] = [];
    for (const [t, name, x] of [
      [preset('turntable'), 'Turntable', 0],
      [libraryToTemplate(LIBRARY.find((d) => d.id === 'denon-pma-510ae')!), 'Amp', 300],
      [preset('passiveSpeaker'), 'Left', 600],
      [preset('passiveSpeaker'), 'Right', 900],
    ] as const) {
      const r = addDevice(p, t, name, { x, y: 0 });
      p = r.project;
      ids.push(r.device.id);
    }
    const r = suggestWiring(p, ids);
    const label = (e: { deviceId: string; portId: string }) => {
      const d = r.project.devices.find((x) => x.id === e.deviceId)!;
      return `${d.name}/${r.project.templates[d.templateId].ports.find((x) => x.id === e.portId)!.label}`;
    };
    expect(r.project.cables.map((c) => `${label(c.ends[0])} -> ${label(c.ends[1])}`)).toEqual([
      'Turntable/Out L -> Amp/PHONO L',
      'Turntable/Out R -> Amp/PHONO R',
      'Amp/SPEAKERS A L -> Left/Speaker In',
      'Amp/SPEAKERS A R -> Right/Speaker In',
    ]);
  });
});

describe('suggest wiring: hi-fi amp next to an interface', () => {
  it('feeds the amp from the interface and the speakers from the amp, never line into a speaker', async () => {
    const { suggestWiring } = await import('./autowire');
    let p: Project = createProject();
    const ids: string[] = [];
    for (const [t, name, x] of [
      [preset('turntable'), 'Turntable', 0],
      [libraryToTemplate(LIBRARY.find((d) => d.id === 'swissonic-audio-2')!), 'Audio 2', 200],
      [preset('computer'), 'Computer', 400],
      [libraryToTemplate(LIBRARY.find((d) => d.id === 'denon-pma-510ae')!), 'Amp', 600],
      [preset('passiveSpeaker'), 'Left', 900],
      [preset('passiveSpeaker'), 'Right', 1100],
    ] as const) {
      const r = addDevice(p, t, name, { x, y: 0 });
      p = r.project;
      ids.push(r.device.id);
    }
    const r = suggestWiring(p, ids);
    const label = (e: { deviceId: string; portId: string }) => {
      const d = r.project.devices.find((x) => x.id === e.deviceId)!;
      return `${d.name}/${r.project.templates[d.templateId].ports.find((x) => x.id === e.portId)!.label}`;
    };
    const cables = r.project.cables.map((c) => `${label(c.ends[0])} -> ${label(c.ends[1])}`);
    expect(cables).toContain('Amp/SPEAKERS A L -> Left/Speaker In');
    expect(cables).toContain('Amp/SPEAKERS A R -> Right/Speaker In');
    expect(cables).toContain('Audio 2/MAIN OUTPUTS LEFT -> Amp/LINE L');
    expect(cables).toContain('Audio 2/MAIN OUTPUTS RIGHT -> Amp/LINE R');
    expect(cables.some((c) => c.startsWith('Audio 2/') && c.endsWith('Speaker In'))).toBe(false);

  });
});
