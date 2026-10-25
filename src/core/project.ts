import { formatCableLabel, newId } from './ids';
import type { Cable, CableEnd, DeviceInstance, DeviceTemplate, Group, Port, Project } from './model';
import { SCHEMA_VERSION } from './model';

/**
 * Pure project operations. Every function returns a new Project and never
 * mutates its input, which keeps undo/redo trivial.
 */

export function createProject(name = 'Untitled project'): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('p-'),
    name,
    templates: {},
    devices: [],
    cables: [],
    groups: [],
    nextCableNumber: 1,
  };
}

export function addDevice(
  project: Project,
  template: DeviceTemplate,
  name: string,
  position: { x: number; y: number },
): { project: Project; device: DeviceInstance } {
  const device: DeviceInstance = { id: newId('d-'), templateId: template.id, name, position };
  return {
    device,
    project: {
      ...project,
      templates: { ...project.templates, [template.id]: template },
      devices: [...project.devices, device],
    },
  };
}

export function updateDevice(project: Project, id: string, patch: Partial<DeviceInstance>): Project {
  return { ...project, devices: project.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

/**
 * Removes the device, its cables and its template if no longer used.
 * Devices sitting on it (pedals on a board) stay and move to the main level.
 */
export function removeDevice(project: Project, id: string): Project {
  const device = project.devices.find((d) => d.id === id);
  if (!device) return project;
  const devices = project.devices
    .filter((d) => d.id !== id)
    .map((d) => (d.containerId === id ? withoutContainer(d) : d));
  const templates = { ...project.templates };
  if (!devices.some((d) => d.templateId === device.templateId)) delete templates[device.templateId];
  const cables = project.cables.filter((c) => !c.ends.some((e) => e.deviceId === id));
  const cableIds = new Set(cables.map((c) => c.id));
  return {
    ...project,
    devices,
    templates,
    cables,
    groups: project.groups.map((g) => ({
      ...g,
      deviceIds: g.deviceIds.filter((d) => d !== id),
      cableIds: g.cableIds.filter((c) => cableIds.has(c)),
    })),
    // Notes go with the device and its cables.
    ...(project.notes
      ? { notes: project.notes.filter((n) => (n.target.kind === 'device' ? n.target.id !== id : cableIds.has(n.target.id))) }
      : {}),
  };
}

function withoutContainer(d: DeviceInstance): DeviceInstance {
  const { containerId: _containerId, ...rest } = d;
  return rest;
}

export function addCable(project: Project, from: CableEnd, to: CableEnd): { project: Project; cable: Cable } {
  const cable: Cable = {
    id: newId('c-'),
    label: formatCableLabel(project.nextCableNumber),
    ends: [from, to],
  };
  return {
    cable,
    project: { ...project, cables: [...project.cables, cable], nextCableNumber: project.nextCableNumber + 1 },
  };
}

export function updateCable(project: Project, id: string, patch: Partial<Cable>): Project {
  return { ...project, cables: project.cables.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function removeCable(project: Project, id: string): Project {
  return {
    ...project,
    cables: project.cables.filter((c) => c.id !== id),
    groups: project.groups.map((g) => ({ ...g, cableIds: g.cableIds.filter((c) => c !== id) })),
    ...(project.notes ? { notes: project.notes.filter((n) => n.target.id !== id) } : {}),
  };
}

// ---------- Systems (groups) ----------

export const GROUP_COLORS = ['#ffb547', '#4fd1a5', '#ff7ab6', '#7aa7ff', '#c39bff', '#ffe066', '#ff8a5c', '#5ad1e6'];

export function addGroup(
  project: Project,
  name: string,
  members: { deviceIds?: string[]; cableIds?: string[] } = {},
): { project: Project; group: Group } {
  const group: Group = {
    id: newId('g-'),
    name,
    color: GROUP_COLORS[project.groups.length % GROUP_COLORS.length],
    deviceIds: [...new Set(members.deviceIds ?? [])],
    cableIds: [...new Set(members.cableIds ?? [])],
  };
  return { group, project: { ...project, groups: [...project.groups, group] } };
}

export function updateGroup(project: Project, id: string, patch: Partial<Omit<Group, 'id'>>): Project {
  return { ...project, groups: project.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
}

export function removeGroup(project: Project, id: string): Project {
  return { ...project, groups: project.groups.filter((g) => g.id !== id) };
}

/** Adds or removes a device or cable from a group. */
export function toggleInGroup(project: Project, groupId: string, kind: 'device' | 'cable', id: string): Project {
  return {
    ...project,
    groups: project.groups.map((g) => {
      if (g.id !== groupId) return g;
      const key = kind === 'device' ? 'deviceIds' : 'cableIds';
      const list = g[key];
      return { ...g, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    }),
  };
}

/**
 * Adds a device to a system (or removes it), together with the cables that
 * connect it to the system's other devices.
 */
export function setDeviceInGroup(project: Project, groupId: string, deviceId: string, member: boolean): Project {
  return {
    ...project,
    groups: project.groups.map((g) => {
      if (g.id !== groupId) return g;
      const devices = new Set(g.deviceIds);
      if (member) devices.add(deviceId);
      else devices.delete(deviceId);
      const touching = project.cables.filter((c) => c.ends.some((e) => e.deviceId === deviceId));
      const cables = new Set(g.cableIds);
      for (const c of touching) {
        const other = c.ends.find((e) => e.deviceId !== deviceId)?.deviceId;
        if (member && other && devices.has(other)) cables.add(c.id);
        if (!member) cables.delete(c.id);
      }
      return { ...g, deviceIds: [...devices], cableIds: [...cables] };
    }),
  };
}

// ---------- Pedalboards (containers) ----------

/** Puts a device on a board (or back on the main level with `null`). */
export function setContainer(project: Project, deviceId: string, containerId: string | null): Project {
  if (deviceId === containerId) return project;
  return {
    ...project,
    devices: project.devices.map((d) => {
      if (d.id !== deviceId) return d;
      return containerId ? { ...d, containerId } : withoutContainer(d);
    }),
  };
}

export function childrenOf(project: Project, containerId: string): DeviceInstance[] {
  return project.devices.filter((d) => d.containerId === containerId);
}

/**
 * Ports of a board's devices that the main view shows on the board block:
 * every port that is not cabled to another device on the same board
 * (typically the input of the first pedal and the output of the last one).
 */
export function exposedPorts(project: Project, containerId: string): { deviceId: string; port: Port }[] {
  const children = new Set(childrenOf(project, containerId).map((d) => d.id));
  const internal = new Set<string>();
  for (const c of project.cables) {
    const [a, b] = c.ends;
    if (children.has(a.deviceId) && children.has(b.deviceId)) {
      internal.add(`${a.deviceId}/${a.portId}`);
      internal.add(`${b.deviceId}/${b.portId}`);
    }
  }
  const result: { deviceId: string; port: Port }[] = [];
  for (const d of project.devices) {
    if (d.containerId !== containerId) continue;
    for (const port of project.templates[d.templateId]?.ports ?? []) {
      if (!internal.has(`${d.id}/${port.id}`)) result.push({ deviceId: d.id, port });
    }
  }
  return result;
}

// ---------- Lookups ----------

export function getDevice(project: Project, id: string): DeviceInstance | undefined {
  return project.devices.find((d) => d.id === id);
}

export function getTemplate(project: Project, device: DeviceInstance): DeviceTemplate | undefined {
  return project.templates[device.templateId];
}

export function getPort(project: Project, end: CableEnd): Port | undefined {
  const device = getDevice(project, end.deviceId);
  if (!device) return undefined;
  return getTemplate(project, device)?.ports.find((p) => p.id === end.portId);
}

export function describeEnd(project: Project, end: CableEnd): string {
  const device = getDevice(project, end.deviceId);
  const port = getPort(project, end);
  return `${device?.name ?? '?'} / ${port?.label ?? '?'}`;
}

// ---------- Serialization ----------

export const FILE_EXTENSION = '.studiocable';

export function serializeProject(project: Project): string {
  return JSON.stringify({ format: 'studiocable-project', ...project }, null, 2);
}

export class ProjectParseError extends Error {}

/** Parses a project file and migrates older schema versions. */
export function parseProject(json: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectParseError('notJson');
  }
  if (!data || typeof data !== 'object' || (data as { format?: unknown }).format !== 'studiocable-project') {
    throw new ProjectParseError('notProject');
  }
  const raw = data as Project & { format?: string };
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION) {
    throw new ProjectParseError('tooNew');
  }
  const { format: _format, ...project } = raw;
  return migrate(project);
}

function migrate(project: Project): Project {
  let p = project;
  // v1 -> v2: systems (groups) and pedalboards (containerId, optional) added.
  if (p.schemaVersion === 1) p = { ...p, schemaVersion: 2, groups: [] };
  return p;
}
