import { describe, expect, it } from 'vitest';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import type { Project } from './model';
import {
  addCable,
  addDevice,
  addGroup,
  childrenOf,
  createProject,
  exposedPorts,
  parseProject,
  removeCable,
  removeDevice,
  serializeProject,
  setContainer,
  toggleInGroup,
} from './project';
import { traceFromPort } from './signalFlow';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

/** Guitar -> board [pedal A -> pedal B] -> amp. */
function rig() {
  let p: Project = createProject();
  const add = (key: string, name: string) => {
    const r = addDevice(p, preset(key), name, { x: 0, y: 0 });
    p = r.project;
    return r.device;
  };
  const guitar = add('guitar', 'Guitar');
  const board = add('pedalboard', 'Board');
  const a = add('pedalMono', 'Drive');
  const b = add('pedalMono', 'Delay');
  const amp = add('guitarAmp', 'Amp');
  p = setContainer(p, a.id, board.id);
  p = setContainer(p, b.id, board.id);
  const port = (deviceId: string, label: string) => {
    const d = p.devices.find((x) => x.id === deviceId)!;
    return { deviceId, portId: p.templates[d.templateId].ports.find((x) => x.label === label)!.id };
  };
  const cable = (x: ReturnType<typeof port>, y: ReturnType<typeof port>) => {
    const r = addCable(p, x, y);
    p = r.project;
    return r.cable.id;
  };
  const c1 = cable(port(guitar.id, 'Out'), port(a.id, 'Input'));
  const c2 = cable(port(a.id, 'Output'), port(b.id, 'Input'));
  const c3 = cable(port(b.id, 'Output'), port(amp.id, 'Input'));
  return { get p() { return p; }, set p(v) { p = v; }, guitar, board, a, b, amp, port, cables: [c1, c2, c3] };
}

describe('systems (groups)', () => {
  it('adds, toggles and cleans up members', () => {
    const r = rig();
    let { project, group } = addGroup(r.p, 'Guitar rig', { deviceIds: [r.guitar.id, r.amp.id], cableIds: r.cables });
    expect(group.color).toMatch(/^#/);
    project = toggleInGroup(project, group.id, 'device', r.a.id);
    expect(project.groups[0].deviceIds).toContain(r.a.id);
    project = toggleInGroup(project, group.id, 'device', r.a.id);
    expect(project.groups[0].deviceIds).not.toContain(r.a.id);

    project = removeCable(project, r.cables[2]);
    expect(project.groups[0].cableIds).toEqual(r.cables.slice(0, 2));
    project = removeDevice(project, r.guitar.id);
    expect(project.groups[0].deviceIds).toEqual([r.amp.id]);
    expect(project.groups[0].cableIds).toEqual([r.cables[1]]);
  });
});

describe('pedalboards', () => {
  it('lists the pedals on a board and the ports that face outwards', () => {
    const r = rig();
    expect(childrenOf(r.p, r.board.id).map((d) => d.name)).toEqual(['Drive', 'Delay']);
    const exposed = exposedPorts(r.p, r.board.id).map((e) => `${r.p.devices.find((d) => d.id === e.deviceId)!.name}/${e.port.label}`);
    expect(exposed).toEqual(['Drive/Input', 'Delay/Output']);
  });

  it('traces the signal through the pedals into the amp', () => {
    const r = rig();
    const down = traceFromPort(r.p, r.port(r.guitar.id, 'Out')).downstream;
    expect(down).toHaveLength(1);
    expect(down[0].ports.map((x) => r.p.devices.find((d) => d.id === x.deviceId)!.name)).toEqual([
      'Guitar', 'Drive', 'Drive', 'Delay', 'Delay', 'Amp',
    ]);
  });

  it('moves pedals back to the main level when the board is deleted', () => {
    const r = rig();
    const p = removeDevice(r.p, r.board.id);
    expect(p.devices.filter((d) => d.containerId)).toEqual([]);
    expect(p.cables).toHaveLength(3);
  });

  it('routes an amp through its effects loop only when something is patched into FX Return', () => {
    const r = rig();
    const mon = addDevice(r.p, preset('activeMonitor'), 'Monitor', { x: 0, y: 0 });
    r.p = mon.project;
    r.p = addCable(r.p, r.port(r.amp.id, 'Line Out'), r.port(mon.device.id, 'Input')).project;
    const name = (x: { deviceId: string; portId: string }) => {
      const d = r.p.devices.find((dd) => dd.id === x.deviceId)!;
      return `${d.name}/${r.p.templates[d.templateId].ports.find((q) => q.id === x.portId)!.label}`;
    };
    const paths = () => traceFromPort(r.p, r.port(r.amp.id, 'Input')).downstream.map((path) => path.ports.map(name).join(' > '));
    // Loop empty: bridged internally.
    expect(paths()).toEqual(['Amp/Input > Amp/Line Out > Monitor/Input']);

    // A pedal in the loop: the bridge breaks and the signal goes through the pedal.
    const fx = addDevice(r.p, preset('pedalMono'), 'Reverb', { x: 0, y: 0 });
    r.p = fx.project;
    r.p = addCable(r.p, r.port(r.amp.id, 'FX Send'), r.port(fx.device.id, 'Input')).project;
    r.p = addCable(r.p, r.port(fx.device.id, 'Output'), r.port(r.amp.id, 'FX Return')).project;
    expect(paths()).toEqual([
      'Amp/Input > Amp/FX Send > Reverb/Input > Reverb/Output > Amp/FX Return > Amp/Line Out > Monitor/Input',
    ]);
  });
});

describe('file format v2', () => {
  it('migrates v1 files (no groups) and round-trips v2', () => {
    const v1 = JSON.stringify({ format: 'studiocable-project', schemaVersion: 1, id: 'p', name: 'Old', templates: {}, devices: [], cables: [], nextCableNumber: 1 });
    const p = parseProject(v1);
    expect(p.schemaVersion).toBe(2);
    expect(p.groups).toEqual([]);
    const r = rig();
    expect(parseProject(serializeProject(r.p))).toEqual(r.p);
  });
});
