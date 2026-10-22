import { isPowerSignal, type Cable, type DeviceInstance, type DeviceTemplate, type Port, type Project } from './model';
import { getPort, removeCable } from './project';

/**
 * The power layer: power supplies, outlets, power cables and the power inputs
 * of devices. Everything here can be hidden as a whole in the diagram.
 */

export const isPowerPort = (port: Port | undefined) => !!port && isPowerSignal(port.signal);

/** A cable is a power cable if either end is a power port. */
export const isPowerCable = (project: Project, cable: Cable) => cable.ends.some((e) => isPowerPort(getPort(project, e)));

/** Devices that only exist for power (outlets, strips, power supplies). */
export const isPowerDevice = (project: Project, device: DeviceInstance) =>
  project.templates[device.templateId]?.category === 'power';

/** The kinds of power input a user can pick for a device. */
export const POWER_INPUT_KINDS = ['iec', 'iec-c7', 'schuko', 'powercon', 'dc', 'usb'] as const;
export type PowerInputKind = (typeof POWER_INPUT_KINDS)[number];

const POWER_INPUT_PORT: Record<PowerInputKind, Omit<Port, 'id'>> = {
  iec: { label: 'Power', direction: 'in', connectors: [{ type: 'iec', gender: 'male' }], signal: 'power-ac' },
  'iec-c7': { label: 'Power', direction: 'in', connectors: [{ type: 'iec-c7', gender: 'male' }], signal: 'power-ac' },
  schuko: { label: 'Mains Plug', direction: 'in', connectors: [{ type: 'schuko', gender: 'male' }], signal: 'power-ac' },
  powercon: { label: 'Power', direction: 'in', connectors: [{ type: 'powercon', gender: 'male' }], signal: 'power-ac' },
  dc: { label: 'DC In', direction: 'in', connectors: [{ type: 'dc-barrel', gender: 'female' }], signal: 'power-dc' },
  usb: { label: 'USB Power', direction: 'in', connectors: [{ type: 'usb-c', gender: 'female' }], signal: 'power-dc' },
};

/** The device model's power input, if it has one. */
export function powerInputOf(template: DeviceTemplate): Port | undefined {
  return template.ports.find((p) => p.direction === 'in' && isPowerSignal(p.signal));
}

/** Which of the pickable kinds a power input port is (undefined if none or unusual). */
export function powerInputKind(port: Port | undefined): PowerInputKind | undefined {
  if (!port) return undefined;
  const type = port.connectors[0]?.type;
  if (type === 'dc-barrel') return 'dc';
  if (type === 'usb-c') return 'usb';
  return POWER_INPUT_KINDS.find((k) => k === type);
}

/**
 * Sets (or removes, with `null`) the power input of a device model in this
 * project. Applies to every device of that model. Cables on a removed or
 * changed input stay only if the input still exists.
 */
export function setPowerInput(project: Project, templateId: string, kind: PowerInputKind | null): Project {
  const template = project.templates[templateId];
  if (!template) return project;
  const existing = powerInputOf(template);
  let ports: Port[];
  if (kind === null) {
    ports = template.ports.filter((p) => p !== existing);
  } else if (existing) {
    ports = template.ports.map((p) => (p === existing ? { ...POWER_INPUT_PORT[kind], id: p.id } : p));
  } else {
    ports = [...template.ports, { ...POWER_INPUT_PORT[kind], id: 'power-in' }];
  }
  let next: Project = { ...project, templates: { ...project.templates, [templateId]: { ...template, ports } } };
  if (kind === null && existing) {
    // Remove cables that were plugged into the input that no longer exists.
    const usesModel = new Set(project.devices.filter((d) => d.templateId === templateId).map((d) => d.id));
    for (const c of project.cables) {
      if (c.ends.some((e) => usesModel.has(e.deviceId) && e.portId === existing.id)) next = removeCable(next, c.id);
    }
  }
  return next;
}
