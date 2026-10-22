import { describe, expect, it } from 'vitest';
import { diagnose } from './diagnose';
import type { Project } from './model';
import { describeEnd, removeCable } from './project';
import { addSetup, SETUP_PRESETS } from './setups';
import { createProject } from './project';

const setup = (key: string) => addSetup(createProject(), SETUP_PRESETS.find((s) => s.key === key)!, key, { x: 0, y: 0 }).project;
const id = (p: Project, name: string) => p.devices.find((d) => d.name === name)!.id;
const steps = (p: Project, d: ReturnType<typeof diagnose>) => d.steps.map((s) => `${describeEnd(p, s.from)} -> ${describeEnd(p, s.to)}`);

describe('diagnose', () => {
  it('follows the signal through an interface to the computer', () => {
    const p = setup('homeStudio');
    const d = diagnose(p, id(p, 'Vocal Mic'), id(p, 'Computer'));
    expect(d.arrives).toBe(true);
    expect(steps(p, d)).toEqual(['Vocal Mic / Out -> Interface / Input 1', 'Interface / USB -> Computer / USB 1']);
  });

  it('goes through pedals on a board using their internal routing', () => {
    const p = setup('guitarRig');
    const d = diagnose(p, id(p, 'Guitar'), id(p, 'Guitar Amp'));
    expect(d.arrives).toBe(true);
    expect(steps(p, d)).toEqual([
      'Guitar / Out -> Overdrive / Input',
      'Overdrive / Output -> Delay / Input',
      'Delay / Output -> Guitar Amp / Input',
    ]);
  });

  it('finds the missing cable and offers a fix', () => {
    let p = setup('homeStudio');
    const usb = p.cables.find((c) => describeEnd(p, c.ends[0]).startsWith('Interface / USB'))!;
    p = removeCable(p, usb.id);
    const d = diagnose(p, id(p, 'Vocal Mic'), id(p, 'Computer'));
    expect(d.arrives).toBe(false);
    expect(d.problem).toBe('targetUnplugged');
    expect(p.devices.find((x) => x.id === d.stuckAt)?.name).toBe('Interface');
    expect(d.fix).toBeDefined();
    expect(diagnose(d.fix!.project, id(p, 'Vocal Mic'), id(p, 'Computer')).arrives).toBe(true);
  });

  it('closes a gap in the middle of a chain', () => {
    let p = setup('rehearsal');
    const mixerToPa = p.cables.filter((c) => describeEnd(p, c.ends[1]).startsWith('PA Left'));
    for (const c of mixerToPa) p = removeCable(p, c.id);
    const d = diagnose(p, id(p, 'Vocals'), id(p, 'PA Left'));
    expect(d.arrives).toBe(false);
    expect(p.devices.find((x) => x.id === d.fix?.fromDevice)?.name).toBe('Mixer');
    expect(diagnose(d.fix!.project, id(p, 'Vocals'), id(p, 'PA Left')).arrives).toBe(true);
  });

  it('reports an unplugged source', () => {
    let p = setup('podcast');
    const micCable = p.cables.find((c) => describeEnd(p, c.ends[0]).startsWith('Guest Mic'))!;
    p = removeCable(p, micCable.id);
    const d = diagnose(p, id(p, 'Guest Mic'), id(p, 'Computer'));
    expect(d.problem).toBe('sourceUnplugged');
    expect(d.steps).toEqual([]);
  });
});
