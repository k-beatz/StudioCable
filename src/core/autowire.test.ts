import { describe, expect, it } from 'vitest';
import { connectChain, connectDevices, suggestWiring } from './autowire';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import type { Project } from './model';
import { createProject, addDevice, describeEnd, setContainer } from './project';
import { checkProject } from './validation';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

function studio() {
  let p: Project = createProject();
  const add = (key: string, name: string, x = 0, y = 0) => {
    const r = addDevice(p, preset(key), name, { x, y });
    p = r.project;
    return r.device.id;
  };
  return { add, get p() { return p; }, set p(v) { p = v; } };
}

/** "Guitar / Out -> Drive / Input" lines for easy reading. */
const wiring = (p: Project, ids?: string[]) =>
  p.cables
    .filter((c) => !ids || ids.includes(c.id))
    .map((c) => `${describeEnd(p, c.ends[0])} -> ${describeEnd(p, c.ends[1])}`);

describe('connectDevices', () => {
  it('picks matching ports: guitar into the instrument input of an amp', () => {
    const s = studio();
    const guitar = s.add('guitar', 'Guitar');
    const amp = s.add('guitarAmp', 'Amp');
    const r = connectDevices(s.p, guitar, amp)!;
    expect(wiring(r.project)).toEqual(['Guitar / Out -> Amp / Input']);
  });

  it('prefers the line output over the effects send', () => {
    const s = studio();
    const amp = s.add('guitarAmp', 'Amp');
    const mixer = s.add('mixer8', 'Mixer');
    const r = connectDevices(s.p, amp, mixer)!;
    expect(wiring(r.project)).toEqual(['Amp / Line Out -> Mixer / Line In 1']);
  });

  it('connects stereo pairs with two cables', () => {
    const s = studio();
    const mixer = s.add('mixer8', 'Mixer');
    const iface = s.add('interface2x2', 'Interface');
    const r = connectDevices(s.p, mixer, iface)!;
    expect(wiring(r.project)).toEqual(['Mixer / Main Out 1 -> Interface / Input 1', 'Mixer / Main Out 2 -> Interface / Input 2']);
  });

  it('uses the next free input and never makes a dangerous connection', () => {
    const s = studio();
    const mic1 = s.add('dynamicMic', 'Mic 1');
    const mic2 = s.add('dynamicMic', 'Mic 2');
    const mixer = s.add('mixer8', 'Mixer');
    s.p = connectDevices(s.p, mic1, mixer)!.project;
    s.p = connectDevices(s.p, mic2, mixer)!.project;
    expect(wiring(s.p)).toEqual(['Mic 1 / Out -> Mixer / Mic In 1', 'Mic 2 / Out -> Mixer / Mic In 2']);
    expect(checkProject(s.p).filter((i) => i.severity !== 'info')).toEqual([]);
  });

  it('returns null when nothing fits', () => {
    const s = studio();
    const a = s.add('headphones', 'Phones');
    const b = s.add('dynamicMic', 'Mic');
    expect(connectDevices(s.p, a, b)).toBeNull();
  });
});

describe('connectChain', () => {
  it('wires a whole chain in the order it was drawn', () => {
    const s = studio();
    const ids = [
      s.add('guitar', 'Guitar'),
      s.add('pedalMono', 'Drive'),
      s.add('guitarAmp', 'Amp'),
      s.add('mixer8', 'Mixer'),
      s.add('interface2x2', 'Interface'),
      s.add('computer', 'Mac'),
    ];
    const r = connectChain(s.p, ids);
    expect(r.failed).toEqual([]);
    expect(wiring(r.project)).toEqual([
      'Guitar / Out -> Drive / Input',
      'Drive / Output -> Amp / Input',
      'Amp / Line Out -> Mixer / Line In 1',
      'Mixer / Main Out 1 -> Interface / Input 1',
      'Mixer / Main Out 2 -> Interface / Input 2',
      'Interface / USB -> Mac / USB 1',
    ]);
  });

  it('reports steps that cannot be connected', () => {
    const s = studio();
    const phones = s.add('headphones', 'Phones');
    const mic = s.add('dynamicMic', 'Mic');
    expect(connectChain(s.p, [phones, mic]).failed).toEqual([[phones, mic]]);
  });

  it('goes through a closed pedalboard', () => {
    const s = studio();
    const guitar = s.add('guitar', 'Guitar');
    const board = s.add('pedalboard', 'Board');
    const drive = s.add('pedalMono', 'Drive');
    const amp = s.add('guitarAmp', 'Amp');
    s.p = setContainer(s.p, drive, board);
    const r = connectChain(s.p, [guitar, board, amp]);
    expect(wiring(r.project)).toEqual(['Guitar / Out -> Drive / Input', 'Drive / Output -> Amp / Input']);
  });
});

describe('suggestWiring', () => {
  it('wires a typical home studio sensibly', () => {
    const s = studio();
    const ids = [
      s.add('guitar', 'Guitar', 0, 0),
      s.add('pedalMono', 'Drive', 200, 0),
      s.add('pedalMono', 'Delay', 400, 0),
      s.add('guitarAmp', 'Amp', 600, 0),
      s.add('dynamicMic', 'Vocal Mic', 600, 300),
      s.add('mixer8', 'Mixer', 900, 0),
      s.add('interface2x2', 'Interface', 1200, 0),
      s.add('computer', 'Mac', 1500, 0),
      s.add('activeMonitor', 'Monitor L', 1500, 300),
      s.add('activeMonitor', 'Monitor R', 1700, 300),
      s.add('headphones', 'Phones', 1500, 600),
    ];
    const r = suggestWiring(s.p, ids);
    expect(wiring(r.project)).toEqual([
      'Guitar / Out -> Drive / Input',
      'Vocal Mic / Out -> Mixer / Mic In 1',
      'Drive / Output -> Delay / Input',
      'Delay / Output -> Amp / Input',
      'Amp / Line Out -> Mixer / Line In 1',
      'Mixer / Main Out 1 -> Interface / Input 1',
      'Mixer / Main Out 2 -> Interface / Input 2',
      'Interface / USB -> Mac / USB 1',
      'Interface / Output 1 -> Monitor L / Input',
      'Interface / Output 2 -> Monitor R / Input',
      'Interface / Phones -> Phones / Plug',
    ]);
    expect(checkProject(r.project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('keeps existing cables and does not wire twice', () => {
    const s = studio();
    const ids = [s.add('guitar', 'Guitar'), s.add('guitarAmp', 'Amp')];
    const once = suggestWiring(s.p, ids).project;
    const twice = suggestWiring(once, ids);
    expect(twice.added).toEqual([]);
    expect(twice.project.cables).toHaveLength(1);
  });
});
