import { describe, expect, it } from 'vitest';
import type { Project } from './model';
import { addDevice, createProject, describeEnd } from './project';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { addSetup, freeAreaBelow, SETUP_PRESETS } from './setups';
import { checkProject } from './validation';

const wiring = (p: Project) => p.cables.map((c) => `${describeEnd(p, c.ends[0])} -> ${describeEnd(p, c.ends[1])}`);

describe('setup presets', () => {
  for (const setup of SETUP_PRESETS) {
    it(`${setup.key}: builds a wired system without errors or warnings`, () => {
      const { project, deviceIds } = addSetup(createProject(), setup, setup.key, { x: 0, y: 0 });
      expect(deviceIds).toHaveLength(setup.devices.length);
      expect(project.cables.length).toBeGreaterThan(0);
      expect(project.groups).toHaveLength(1);
      expect(project.groups[0].deviceIds).toHaveLength(setup.devices.length);
      expect(checkProject(project).filter((i) => i.severity !== 'info')).toEqual([]);
      // Every device on the main level is connected to something.
      for (const d of project.devices) {
        expect(project.cables.some((c) => c.ends.some((e) => e.deviceId === d.id || project.devices.find((x) => x.id === e.deviceId)?.containerId === d.id))).toBe(true);
      }
    });
  }

  it('wires the guitar rig through the pedalboard and powers the pedals', () => {
    const setup = SETUP_PRESETS.find((s) => s.key === 'guitarRig')!;
    const { project } = addSetup(createProject(), setup, 'Guitar rig', { x: 0, y: 0 });
    expect(wiring(project)).toEqual(
      expect.arrayContaining([
        'Guitar / Out -> Overdrive / Input',
        'Overdrive / Output -> Delay / Input',
        'Delay / Output -> Guitar Amp / Input',
        'Pedal Power / DC Out 1 -> Overdrive / DC In',
        'Pedal Power / DC Out 2 -> Delay / DC In',
      ]),
    );
  });

  it('never plugs the keyboard into the amp effects return', () => {
    const setup = SETUP_PRESETS.find((s) => s.key === 'rehearsal')!;
    const { project } = addSetup(createProject(), setup, 'Band', { x: 0, y: 0 });
    expect(wiring(project).some((w) => w.includes('FX Return'))).toBe(false);
    expect(wiring(project)).toEqual(expect.arrayContaining(['Keys / Out L -> Mixer / Stereo In 5/6 L', 'Keys / Out R -> Mixer / Stereo In 5/6 R']));
  });

  it('adds next to an existing project without touching it, continuing the cable numbers', () => {
    let p = createProject();
    const spec = GENERIC_PRESETS.find((x) => x.key === 'mixer8')!.spec;
    p = addDevice(p, buildTemplate(spec), 'Old Mixer', { x: 100, y: 100 }).project;
    p = { ...p, nextCableNumber: 7 };
    const origin = freeAreaBelow(p);
    const { project } = addSetup(p, SETUP_PRESETS[0], 'Home studio', origin);
    expect(project.devices[0]).toMatchObject({ name: 'Old Mixer', position: { x: 100, y: 100 } });
    expect(project.cables[0].label).toBe('C-007');
    expect(Math.min(...project.devices.slice(1).map((d) => d.position.y))).toBeGreaterThanOrEqual(origin.y);
  });
});

describe('synth studio', () => {
  it('sends both synths into the mixer, and the mixer into the interface', () => {
    const setup = SETUP_PRESETS.find((s) => s.key === 'synthStudio')!;
    const { project } = addSetup(createProject(), setup, 'Synths', { x: 0, y: 0 });
    const w = wiring(project);
    expect(w.filter((x) => x.startsWith('Synth')).every((x) => x.includes('-> Mixer /'))).toBe(true);
    expect(w).toEqual(expect.arrayContaining(['Mixer / Main Out 1 -> Interface / Input 1']));
  });
});
