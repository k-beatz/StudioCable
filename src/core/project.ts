import { formatCableLabel, newId } from './ids';
import type { Cable, CableEnd, DeviceInstance, DeviceTemplate, Port, Project } from './model';
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

/** Removes the device, its cables and its template if no longer used. */
export function removeDevice(project: Project, id: string): Project {
  const device = project.devices.find((d) => d.id === id);
  if (!device) return project;
  const devices = project.devices.filter((d) => d.id !== id);
  const templates = { ...project.templates };
  if (!devices.some((d) => d.templateId === device.templateId)) delete templates[device.templateId];
  return {
    ...project,
    devices,
    templates,
    cables: project.cables.filter((c) => !c.ends.some((e) => e.deviceId === id)),
  };
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
  return { ...project, cables: project.cables.filter((c) => c.id !== id) };
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
  // No migrations yet. Future: if (project.schemaVersion === 1) project = v1ToV2(project); ...
  return project;
}
