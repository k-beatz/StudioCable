import type { DeviceCategory, DeviceInstance, Project } from './model';
import { updateDevice } from './project';

/**
 * The rack: one 19" rack per project, counted in height units (U) from the
 * top (slot 1). Each device in the rack has a top slot and a height.
 * Pure functions; moves that would overlap another device are refused.
 */

export const DEFAULT_RACK_UNITS = 12;
export const MAX_RACK_UNITS = 48;

/** Typical heights, used as a first guess when a device goes into the rack. */
const TYPICAL_UNITS: Partial<Record<DeviceCategory, number>> = {
  interface: 1,
  preamp: 1,
  outboard: 1,
  patchbay: 1,
  mixer: 3,
  power: 1,
  computer: 2,
  amp: 2,
};

export const rackUnitsOf = (project: Project) => project.rackUnits ?? DEFAULT_RACK_UNITS;

/** Height of a device in the rack (its own setting, else a typical value). */
export function heightOf(project: Project, device: DeviceInstance): number {
  if (device.rackHeight) return device.rackHeight;
  const category = project.templates[device.templateId]?.category;
  return (category && TYPICAL_UNITS[category]) || 1;
}

export const racked = (project: Project) => project.devices.filter((d) => d.rackSlot !== undefined);

/** Would `device` fit with its top at `slot` and the given height? */
export function fits(project: Project, deviceId: string, slot: number, height: number): boolean {
  if (slot < 1 || slot + height - 1 > rackUnitsOf(project)) return false;
  return racked(project).every((d) => {
    if (d.id === deviceId) return true;
    const top = d.rackSlot!;
    const bottom = top + heightOf(project, d) - 1;
    return slot + height - 1 < top || slot > bottom;
  });
}

/** Puts a device into the first free slot from the top. Unchanged if there is no room. */
export function addToRack(project: Project, deviceId: string): Project {
  const device = project.devices.find((d) => d.id === deviceId);
  if (!device) return project;
  const height = heightOf(project, device);
  for (let slot = 1; slot <= rackUnitsOf(project); slot++) {
    if (fits(project, deviceId, slot, height)) return updateDevice(project, deviceId, { rackSlot: slot, rackHeight: height });
  }
  return project;
}

/** Moves a device to another slot, if it fits there. */
export function moveInRack(project: Project, deviceId: string, slot: number): Project {
  const device = project.devices.find((d) => d.id === deviceId);
  if (!device || device.rackSlot === undefined) return project;
  return fits(project, deviceId, slot, heightOf(project, device)) ? updateDevice(project, deviceId, { rackSlot: slot }) : project;
}

/** Changes a device's height (1–8 U), if the new size still fits. */
export function setRackHeight(project: Project, deviceId: string, height: number): Project {
  const device = project.devices.find((d) => d.id === deviceId);
  const h = Math.max(1, Math.min(8, Math.round(height)));
  if (!device) return project;
  if (device.rackSlot !== undefined && !fits(project, deviceId, device.rackSlot, h)) return project;
  return updateDevice(project, deviceId, { rackHeight: h });
}

export function removeFromRack(project: Project, deviceId: string): Project {
  return {
    ...project,
    devices: project.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const { rackSlot: _slot, ...rest } = d;
      return rest;
    }),
  };
}

/** Changes the rack size; refused if a device would no longer fit. */
export function setRackUnits(project: Project, units: number): Project {
  const u = Math.max(1, Math.min(MAX_RACK_UNITS, Math.round(units)));
  const tooLow = racked(project).some((d) => d.rackSlot! + heightOf(project, d) - 1 > u);
  return tooLow ? project : { ...project, rackUnits: u };
}
