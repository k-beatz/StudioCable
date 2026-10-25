import { describe, expect, it } from 'vitest';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { estimateSize, levelEdges, tidyLayout } from './layout';
import type { Project } from './model';
import { addCable, addDevice, createProject, setContainer } from './project';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

function studio() {
  let p: Project = createProject();
  const add = (key: string, name: string) => {
    const r = addDevice(p, preset(key), name, { x: 500, y: 500 });
    p = r.project;
    return r.device.id;
  };
  const port = (deviceId: string, label: string) => {
    const d = p.devices.find((x) => x.id === deviceId)!;
    return { deviceId, portId: p.templates[d.templateId].ports.find((x) => x.label.startsWith(label))!.id };
  };
  const cable = (a: ReturnType<typeof port>, b: ReturnType<typeof port>) => {
    p = addCable(p, a, b).project;
  };
  return { add, port, cable, get p() { return p; }, set p(v) { p = v; } };
}

const pos = (p: Project, id: string) => p.devices.find((d) => d.id === id)!.position;

describe('tidyLayout', () => {
  it('places devices left to right along the signal flow', () => {
    const s = studio();
    const monitor = s.add('activeMonitor', 'Monitor');
    const mixer = s.add('mixer8', 'Mixer');
    const mic = s.add('dynamicMic', 'Mic');
    s.cable(s.port(mic, 'Out'), s.port(mixer, 'Mic In'));
    s.cable(s.port(mixer, 'Main Out'), s.port(monitor, 'Input'));
    const p = tidyLayout(s.p, null);
    expect(pos(p, mic).x).toBeLessThan(pos(p, mixer).x);
    expect(pos(p, mixer).x).toBeLessThan(pos(p, monitor).x);
  });

  it('follows the signal even if a cable was stored input-first', () => {
    const s = studio();
    const mixer = s.add('mixer8', 'Mixer');
    const mic = s.add('dynamicMic', 'Mic');
    s.cable(s.port(mixer, 'Mic In'), s.port(mic, 'Out'));
    expect(levelEdges(s.p, null)).toEqual([[mic, mixer]]);
    const p = tidyLayout(s.p, null);
    expect(pos(p, mic).x).toBeLessThan(pos(p, mixer).x);
  });

  it('puts devices without cables underneath the connected setup', () => {
    const s = studio();
    const lonely = s.add('headphones', 'Phones');
    const mixer = s.add('mixer8', 'Mixer');
    const mic = s.add('dynamicMic', 'Mic');
    s.cable(s.port(mic, 'Out'), s.port(mixer, 'Mic In'));
    const p = tidyLayout(s.p, null);
    expect(pos(p, lonely).y).toBeGreaterThan(pos(p, mixer).y);
    expect(pos(p, lonely).y).toBeGreaterThan(pos(p, mic).y);
  });

  it('never stacks two devices on the same spot', () => {
    const s = studio();
    const mixer = s.add('mixer8', 'Mixer');
    for (let i = 0; i < 4; i++) {
      const mic = s.add('dynamicMic', `Mic ${i}`);
      const d = s.p.devices.find((x) => x.id === mixer)!;
      const inputs = s.p.templates[d.templateId].ports.filter((x) => x.label.startsWith('Mic In'));
      s.cable(s.port(mic, 'Out'), { deviceId: mixer, portId: inputs[i].id });
    }
    s.add('headphones', 'A');
    s.add('headphones', 'B');
    const p = tidyLayout(s.p, null);
    const spots = p.devices.map((d) => `${d.position.x},${d.position.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('survives loops such as an FX send/return', () => {
    const s = studio();
    const amp = s.add('guitarAmp', 'Amp');
    const fx = s.add('pedalMono', 'Delay');
    const guitar = s.add('guitar', 'Guitar');
    s.cable(s.port(guitar, 'Out'), s.port(amp, 'Input'));
    s.cable(s.port(amp, 'FX Send'), s.port(fx, 'Input'));
    s.cable(s.port(fx, 'Output'), s.port(amp, 'FX Return'));
    const p = tidyLayout(s.p, null);
    expect(pos(p, guitar).x).toBeLessThan(pos(p, amp).x);
    expect(pos(p, amp).x).toBeLessThan(pos(p, fx).x);
  });

  it('only moves the devices of the level being tidied', () => {
    const s = studio();
    const board = s.add('pedalboard', 'Board');
    const pedal = s.add('pedalMono', 'Drive');
    const amp = s.add('guitarAmp', 'Amp');
    s.p = setContainer(s.p, pedal, board);
    s.cable(s.port(pedal, 'Output'), s.port(amp, 'Input'));
    const main = tidyLayout(s.p, null);
    expect(pos(main, pedal)).toEqual({ x: 500, y: 500 });
    expect(pos(main, board).x).toBeLessThan(pos(main, amp).x);
    const inside = tidyLayout(s.p, board);
    expect(pos(inside, amp)).toEqual({ x: 500, y: 500 });
  });

  it('uses the measured sizes so wide devices do not overlap', () => {
    const s = studio();
    const mixer = s.add('mixer8', 'Mixer');
    const mic = s.add('dynamicMic', 'Mic');
    s.cable(s.port(mic, 'Out'), s.port(mixer, 'Mic In'));
    const p = tidyLayout(s.p, null, new Map([[mic, { width: 600, height: 100 }]]));
    expect(pos(p, mixer).x - pos(p, mic).x).toBeGreaterThanOrEqual(600);
  });

  it('lines connected ports up, so a cable runs straight', () => {
    const s = studio();
    const iface = s.add('interface2x2', 'Interface');
    const mic = s.add('dynamicMic', 'Mic');
    s.cable(s.port(mic, 'Out'), s.port(iface, 'Input 2'));
    const p = tidyLayout(s.p, null);
    const portAt = (id: string, label: string) => {
      const d = p.devices.find((x) => x.id === id)!;
      const port = p.templates[d.templateId].ports.find((x) => x.label === label)!;
      return d.position.y + estimateSize(p, d).portY![port.id];
    };
    expect(Math.abs(portAt(mic, 'Out') - portAt(iface, 'Input 2'))).toBeLessThanOrEqual(5);
  });

  it('leaves more room between columns when many cables run through', () => {
    const s = studio();
    const mixer = s.add('mixer8', 'Mixer');
    const mics = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => s.add('dynamicMic', n));
    mics.forEach((m, i) => s.cable(s.port(m, 'Out'), s.port(mixer, `Mic In ${i + 1}`)));
    const p = tidyLayout(s.p, null);
    const gap = pos(p, mixer).x - (pos(p, mics[0]).x + 260);
    expect(gap).toBeGreaterThanOrEqual(6 * 16);
  });
});
