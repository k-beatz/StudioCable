import { describe, expect, it } from 'vitest';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import type { Project } from './model';
import { addDevice, createProject, parseProject, serializeProject } from './project';
import { addToRack, fits, heightOf, moveInRack, removeFromRack, setRackHeight, setRackUnits } from './rack';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

function rack() {
  let p: Project = createProject();
  const add = (key: string, name: string) => {
    const r = addDevice(p, preset(key), name, { x: 0, y: 0 });
    p = r.project;
    return r.device.id;
  };
  const iface = add('interface2x2', 'Interface');
  const pre = add('preamp2', 'Preamp');
  const mixer = add('mixer8', 'Mixer');
  return { p, iface, pre, mixer };
}
const dev = (p: Project, id: string) => p.devices.find((d) => d.id === id)!;

describe('rack', () => {
  it('fills the rack from the top with typical heights', () => {
    let { p, iface, pre, mixer } = rack();
    p = addToRack(p, iface);
    p = addToRack(p, pre);
    p = addToRack(p, mixer);
    expect([dev(p, iface).rackSlot, dev(p, pre).rackSlot, dev(p, mixer).rackSlot]).toEqual([1, 2, 3]);
    expect(heightOf(p, dev(p, mixer))).toBe(3);
  });

  it('refuses moves that would overlap or leave the rack', () => {
    let { p, iface, mixer } = rack();
    p = addToRack(p, iface);
    p = addToRack(p, mixer); // U2-U4
    expect(moveInRack(p, iface, 3)).toBe(p);
    expect(moveInRack(p, mixer, 11)).toBe(p); // would need U11-U13 in a 12U rack
    p = moveInRack(p, iface, 12);
    expect(dev(p, iface).rackSlot).toBe(12);
    expect(fits(p, 'new', 1, 1)).toBe(true);
  });

  it('changes heights only when there is room', () => {
    let { p, iface, pre } = rack();
    p = addToRack(p, iface);
    p = addToRack(p, pre);
    expect(setRackHeight(p, iface, 2)).toBe(p); // would grow into the preamp
    p = setRackHeight(p, pre, 4);
    expect(dev(p, pre).rackHeight).toBe(4);
  });

  it('does not shrink the rack below its devices, and leaves the rack cleanly', () => {
    let { p, mixer } = rack();
    p = addToRack(p, mixer);
    p = moveInRack(p, mixer, 8); // U8-U10
    expect(setRackUnits(p, 9)).toBe(p);
    expect(setRackUnits(p, 10).rackUnits).toBe(10);
    p = removeFromRack(p, mixer);
    expect(dev(p, mixer).rackSlot).toBeUndefined();
  });

  it('is saved with the project', () => {
    let { p, iface } = rack();
    p = setRackUnits(addToRack(p, iface), 16);
    const back = parseProject(serializeProject(p));
    expect(back.rackUnits).toBe(16);
    expect(dev(back, iface).rackSlot).toBe(1);
  });
});
