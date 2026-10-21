import { describe, expect, it } from 'vitest';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import type { DeviceInstance, DeviceTemplate, Project } from './model';
import { addCable, addDevice, createProject } from './project';
import { portKey, traceFromCable, traceFromDevice, traceFromPort, type SignalPath } from './signalFlow';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

/** Small test studio: Mic -> Preamp -> Patchbay (normalled) -> Interface. */
function studio() {
  let project: Project = createProject();
  const devices: Record<string, { device: DeviceInstance; template: DeviceTemplate }> = {};
  for (const [name, key] of [
    ['Mic', 'dynamicMic'],
    ['Pre', 'preamp2'],
    ['Bay', 'patchbay24'],
    ['Iface', 'interface8x8'],
  ] as const) {
    const template = preset(key);
    const r = addDevice(project, template, name, { x: 0, y: 0 });
    project = r.project;
    devices[name] = { device: r.device, template };
  }
  const ref = (name: string, label: string) => {
    const port = devices[name].template.ports.find((p) => p.label === label);
    if (!port) throw new Error(`no port ${label}`);
    return { deviceId: devices[name].device.id, portId: port.id };
  };
  const cable = (a: [string, string], b: [string, string]) => {
    const r = addCable(project, ref(...a), ref(...b));
    project = r.project;
    return r.cable.id;
  };
  const c1 = cable(['Mic', 'Out'], ['Pre', 'Mic In 1']);
  const c2 = cable(['Pre', 'Out 1'], ['Bay', 'Top Rear 1']);
  const c3 = cable(['Bay', 'Bottom Rear 1'], ['Iface', 'Input 1']);
  return { get project() { return project; }, ref, cable, devices, cables: { c1, c2, c3 } };
}

/** Readable form of a path for assertions: "Device/Port" separated by link markers. */
function describe_(s: ReturnType<typeof studio>, path: SignalPath): string {
  const name = (r: { deviceId: string; portId: string }) => {
    const entry = Object.entries(s.devices).find(([, d]) => d.device.id === r.deviceId)!;
    return `${entry[0]}/${entry[1].template.ports.find((p) => p.id === r.portId)!.label}`;
  };
  return path.ports.map((p, i) => (i === 0 ? '' : path.links[i - 1].kind === 'cable' ? ' -> ' : ' => ') + name(p)).join('');
}

describe('signal flow', () => {
  it('follows a signal through preamp and normalled patchbay to the interface', () => {
    const s = studio();
    const trace = traceFromPort(s.project, s.ref('Mic', 'Out'));
    expect(trace.downstream.map((p) => describe_(s, p))).toEqual([
      'Mic/Out -> Pre/Mic In 1 => Pre/Out 1 -> Bay/Top Rear 1 => Bay/Bottom Rear 1 -> Iface/Input 1',
    ]);
    expect(trace.upstream).toEqual([]);
    expect([...trace.cableIds].sort()).toEqual(Object.values(s.cables).sort());
  });

  it('traces back from the interface input to the microphone', () => {
    const s = studio();
    const trace = traceFromPort(s.project, s.ref('Iface', 'Input 1'));
    expect(trace.upstream.map((p) => describe_(s, p))).toEqual([
      'Mic/Out -> Pre/Mic In 1 => Pre/Out 1 -> Bay/Top Rear 1 => Bay/Bottom Rear 1 -> Iface/Input 1',
    ]);
    expect(trace.downstream).toEqual([]);
  });

  it('breaks the patchbay normal when the bottom front jack is patched', () => {
    const s = studio();
    s.cable(['Iface', 'Line Out 1'], ['Bay', 'Bottom Front 1']);
    const down = traceFromPort(s.project, s.ref('Mic', 'Out')).downstream.map((p) => describe_(s, p));
    expect(down).toEqual(['Mic/Out -> Pre/Mic In 1 => Pre/Out 1 -> Bay/Top Rear 1']);
    // ...and the interface input now gets the patched signal instead.
    const up = traceFromPort(s.project, s.ref('Iface', 'Input 1')).upstream.map((p) => describe_(s, p));
    expect(up).toEqual(['Iface/Line Out 1 -> Bay/Bottom Front 1 => Bay/Bottom Rear 1 -> Iface/Input 1']);
  });

  it('keeps the top signal flowing to a patched top front jack (half-normal)', () => {
    const s = studio();
    s.cable(['Bay', 'Top Front 1'], ['Iface', 'Input 2']);
    const down = traceFromPort(s.project, s.ref('Mic', 'Out')).downstream.map((p) => describe_(s, p));
    expect(down).toHaveLength(2);
    expect(down).toContain('Mic/Out -> Pre/Mic In 1 => Pre/Out 1 -> Bay/Top Rear 1 => Bay/Top Front 1 -> Iface/Input 2');
  });

  it('traces a cable in both directions', () => {
    const s = studio();
    const trace = traceFromCable(s.project, s.cables.c2)!;
    expect(trace.upstream.map((p) => describe_(s, p))).toEqual([
      'Mic/Out -> Pre/Mic In 1 => Pre/Out 1 -> Bay/Top Rear 1',
    ]);
    expect(trace.downstream.map((p) => describe_(s, p))).toEqual([
      'Pre/Out 1 -> Bay/Top Rear 1 => Bay/Bottom Rear 1 -> Iface/Input 1',
    ]);
  });

  it('traces a device: sources into it and destinations out of it', () => {
    const s = studio();
    const trace = traceFromDevice(s.project, s.devices.Pre.device);
    expect(trace.upstream.map((p) => describe_(s, p))).toEqual(['Mic/Out -> Pre/Mic In 1']);
    expect(trace.downstream.map((p) => describe_(s, p))).toEqual([
      'Pre/Out 1 -> Bay/Top Rear 1 => Bay/Bottom Rear 1 -> Iface/Input 1',
    ]);
    expect(trace.deviceIds.has(s.devices.Iface.device.id)).toBe(true);
  });

  it('terminates on feedback loops', () => {
    const s = studio();
    s.cable(['Pre', 'Out 2'], ['Pre', 'Mic In 2']);
    s.cable(['Iface', 'Line Out 2'], ['Pre', 'Mic In 2']);
    const trace = traceFromPort(s.project, s.ref('Iface', 'Line Out 2'));
    expect(trace.downstream.map((p) => describe_(s, p))).toEqual([
      'Iface/Line Out 2 -> Pre/Mic In 2 => Pre/Out 2',
    ]);
    expect(trace.portKeys.has(portKey(s.ref('Pre', 'Out 2')))).toBe(true);
  });

  it('ignores cables between two outputs', () => {
    const s = studio();
    s.cable(['Iface', 'Line Out 3'], ['Pre', 'Out 2']);
    expect(traceFromPort(s.project, s.ref('Iface', 'Line Out 3')).downstream).toEqual([]);
  });
});
