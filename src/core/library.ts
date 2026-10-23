import { buildTemplate, portLabels, type GenericSpec, type PortGroup } from './generic';
import {
  CONNECTOR_TYPES,
  DEVICE_CATEGORIES,
  SIGNAL_TYPES,
  KNOB_MAX,
  type Control,
  type DeviceCategory,
  type DeviceTemplate,
  type RouteCondition,
  type Source,
} from './model';

/**
 * Library device files (library/devices/**.json). They describe a real
 * device in compact port groups and always name their sources. See
 * library/README.md for the format.
 */

export const LIBRARY_FORMAT = 'studiocable-device';
export const LIBRARY_SCHEMA_VERSION = 1;

export interface LibraryDevice {
  format: typeof LIBRARY_FORMAT;
  schemaVersion: number;
  /** Stable ID, e.g. "behringer-xenyx-1202sfx". */
  id: string;
  manufacturer: string;
  model: string;
  category: DeviceCategory;
  status: 'verified' | 'unverified';
  sources: Source[];
  notes?: string;
  groups: PortGroup[];
  routing?: LibraryRoute[];
  /** Knobs and switches (see library/README.md). `levelOf` lists port labels. */
  controls?: Control[];
}

/**
 * Internal path by port label. `from` and `to` may be lists: every port in
 * `from` connects to every port in `to` (handy for "all inputs -> main mix").
 */
export interface LibraryRoute {
  from: string | string[];
  to: string | string[];
  breakWhenPatched?: string[];
  /** The path exists only while the controls are in these positions. */
  when?: RouteCondition[];
}

const asList = (x: string | string[]) => (Array.isArray(x) ? x : [x]);

function expandRoutes(routes: LibraryRoute[] = []): NonNullable<GenericSpec['routing']> {
  return routes.flatMap((r) =>
    asList(r.from).flatMap((from) =>
      asList(r.to)
        .filter((to) => to !== from)
        .map((to) => ({
          from,
          to,
          ...(r.breakWhenPatched ? { breakWhenPatched: r.breakWhenPatched } : {}),
          ...(r.when ? { when: r.when } : {}),
        })),
    ),
  );
}

/** Checks a parsed library file. Returns a list of problems (empty = valid). */
export function validateLibraryDevice(data: unknown): string[] {
  const errors: string[] = [];
  const d = data as Partial<LibraryDevice>;
  if (!d || typeof d !== 'object') return ['not an object'];
  if (d.format !== LIBRARY_FORMAT) errors.push(`format must be "${LIBRARY_FORMAT}"`);
  if (d.schemaVersion !== LIBRARY_SCHEMA_VERSION) errors.push(`schemaVersion must be ${LIBRARY_SCHEMA_VERSION}`);
  if (!d.id || !/^[a-z0-9-]+$/.test(d.id)) errors.push('id must be lowercase letters, digits and dashes');
  if (!d.manufacturer) errors.push('manufacturer missing');
  if (!d.model) errors.push('model missing');
  if (!DEVICE_CATEGORIES.includes(d.category as DeviceCategory)) errors.push(`unknown category "${d.category}"`);
  if (d.status !== 'verified' && d.status !== 'unverified') errors.push('status must be verified or unverified');
  if (!Array.isArray(d.sources) || d.sources.length === 0 || d.sources.some((s) => !/^https:\/\//.test(s?.url ?? ''))) {
    errors.push('at least one source with an https URL is required');
  }
  if (!Array.isArray(d.groups) || d.groups.length === 0) return [...errors, 'groups missing'];

  const labels = new Set<string>();
  d.groups.forEach((g, i) => {
    const where = `groups[${i}]`;
    if (!['in', 'out', 'bidi'].includes(g.direction)) errors.push(`${where}: bad direction`);
    if (!SIGNAL_TYPES.includes(g.signal)) errors.push(`${where}: unknown signal "${g.signal}"`);
    for (const s of g.alsoAccepts ?? []) if (!SIGNAL_TYPES.includes(s)) errors.push(`${where}: unknown signal "${s}"`);
    if (!Array.isArray(g.connectors) || g.connectors.length === 0) errors.push(`${where}: connectors missing`);
    for (const c of g.connectors ?? []) {
      if (!CONNECTOR_TYPES.includes(c.type)) errors.push(`${where}: unknown connector "${c.type}"`);
      if (!['male', 'female', 'none'].includes(c.gender)) errors.push(`${where}: bad gender "${c.gender}"`);
    }
    if (!g.labels && !(g.count > 0 && g.label)) errors.push(`${where}: needs labels, or count and label`);
    for (const label of portLabels(g)) {
      if (labels.has(label)) errors.push(`duplicate port label "${label}"`);
      labels.add(label);
    }
  });
  const controls = new Map<string, Control>();
  for (const c of d.controls ?? []) {
    const where = `control "${c.id}"`;
    if (!c.id || controls.has(c.id)) errors.push(`${where}: missing or duplicate id`);
    controls.set(c.id, c);
    if (!c.label) errors.push(`${where}: label missing`);
    if (c.kind === 'switch') {
      if (!c.positions || c.positions.length < 2) errors.push(`${where}: a switch needs at least two positions`);
      else if (!c.positions.includes(String(c.default))) errors.push(`${where}: default must be one of the positions`);
    } else if (c.kind === 'knob') {
      if (typeof c.default !== 'number' || c.default < 0 || c.default > KNOB_MAX) errors.push(`${where}: default must be 0 to ${KNOB_MAX}`);
      for (const label of c.levelOf ?? []) if (!labels.has(label)) errors.push(`${where}: unknown port "${label}"`);
    } else errors.push(`${where}: kind must be knob or switch`);
    if (c.phantomFor && !(c.kind === 'switch' && c.positions?.includes('ON'))) errors.push(`${where}: a phantom switch needs an "ON" position`);
    for (const label of c.phantomFor ?? []) if (!labels.has(label)) errors.push(`${where}: unknown port "${label}"`);
  }
  for (const r of d.routing ?? []) {
    for (const label of [...asList(r.from), ...asList(r.to), ...(r.breakWhenPatched ?? [])]) {
      if (!labels.has(label)) errors.push(`routing refers to unknown port "${label}"`);
    }
    for (const cond of r.when ?? []) {
      const c = controls.get(cond.control);
      if (!c) errors.push(`routing refers to unknown control "${cond.control}"`);
      else if (cond.is && (c.kind !== 'switch' || cond.is.some((v) => !c.positions?.includes(v)))) {
        errors.push(`routing: "${cond.control}" has no position ${JSON.stringify(cond.is)}`);
      }
    }
  }
  return errors;
}

/** Creates a project template (with fresh IDs) from a library entry. */
export function libraryToTemplate(device: LibraryDevice): DeviceTemplate {
  const groups = device.groups.map((g) => ({ ...g, count: g.labels?.length ?? g.count }));
  return {
    ...buildTemplate({ ...device, groups, routing: expandRoutes(device.routing) }, 'library'),
    libraryId: device.id,
    sources: device.sources.map((s) => ({ ...s })),
    verified: device.status === 'verified',
  };
}

/** Lower-case text a search query is matched against. */
export function searchText(device: LibraryDevice): string {
  return `${device.manufacturer} ${device.model} ${device.category} ${device.id}`.toLowerCase();
}

/** Every word of the query must appear somewhere (order doesn't matter). */
export function matchesQuery(device: LibraryDevice, query: string): boolean {
  const text = searchText(device);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}
