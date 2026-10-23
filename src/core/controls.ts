import { KNOB_MAX, type Control, type DeviceInstance, type DeviceTemplate, type InternalRoute, type RouteCondition } from './model';

/**
 * Knobs and switches. A device's internal path can depend on them: a
 * monitoring knob turned fully to "DAW" cuts the direct path, a volume knob
 * at 0 silences its output, a mono/stereo switch changes which input reaches
 * which output. Pure functions, no UI.
 */

export type Setting = string | number;

export function controlValue(control: Control, device: DeviceInstance | undefined): Setting {
  const v = device?.settings?.[control.id];
  if (v === undefined) return control.default;
  return control.kind === 'switch' ? (control.positions?.includes(String(v)) ? v : control.default) : Number(v);
}

function holds(cond: RouteCondition, value: Setting): boolean {
  if (cond.is && !cond.is.includes(String(value))) return false;
  if (cond.min !== undefined && Number(value) < cond.min) return false;
  if (cond.max !== undefined && Number(value) > cond.max) return false;
  return true;
}

/** A value that satisfies the condition, as close to the current one as possible. */
function satisfying(cond: RouteCondition, value: Setting): Setting {
  if (cond.is) return cond.is[0];
  let n = Number(value);
  if (cond.min !== undefined && n < cond.min) n = Math.max(cond.min, 5);
  if (cond.max !== undefined && n > cond.max) n = Math.min(cond.max, 5);
  return n;
}

export interface Blocker {
  control: Control;
  value: Setting;
  /** A position that opens the path again. */
  needed: Setting;
}

/** Controls that keep this internal path closed right now (empty = open). */
export function routeBlockers(template: DeviceTemplate, device: DeviceInstance | undefined, route: InternalRoute): Blocker[] {
  const controls = template.controls ?? [];
  if (!controls.length) return [];
  const result: Blocker[] = [];
  for (const cond of route.when ?? []) {
    const control = controls.find((c) => c.id === cond.control);
    if (!control) continue;
    const value = controlValue(control, device);
    if (!holds(cond, value)) result.push({ control, value, needed: satisfying(cond, value) });
  }
  // Level knobs: turned fully down, nothing passes their ports.
  for (const control of controls) {
    if (control.kind !== 'knob' || !control.levelOf?.some((p) => p === route.from || p === route.to)) continue;
    const value = controlValue(control, device);
    if (Number(value) <= 0 && !result.some((b) => b.control.id === control.id)) result.push({ control, value, needed: 5 });
  }
  return result;
}

export const routeOpen = (template: DeviceTemplate, device: DeviceInstance | undefined, route: InternalRoute) =>
  routeBlockers(template, device, route).length === 0;

/** Short text for a position, e.g. "ON", "MONO" or "7" / "MIN" / "DAW" on a knob. */
export function formatSetting(control: Control, value: Setting): string {
  if (control.kind === 'switch') return String(value);
  const n = Number(value);
  if (n <= 0 && control.minLabel) return control.minLabel;
  if (n >= KNOB_MAX && control.maxLabel) return control.maxLabel;
  return String(Math.round(n * 10) / 10);
}

/**
 * A condenser mic (`needsPhantom`) plugged into `portId`: the phantom switch
 * of that input if it is off. Inputs without a modelled phantom switch never
 * block (most devices don't describe theirs).
 */
export function phantomBlocker(template: DeviceTemplate, device: DeviceInstance | undefined, portId: string): Blocker | undefined {
  const control = template.controls?.find((c) => c.phantomFor?.includes(portId));
  if (!control) return undefined;
  const value = controlValue(control, device);
  return value === 'ON' ? undefined : { control, value, needed: 'ON' };
}
