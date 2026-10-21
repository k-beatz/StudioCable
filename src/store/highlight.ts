import type { Group, Project } from '../core/model';
import { useProjectStore } from './projectStore';
import { useTrace } from './trace';

export interface GroupIndex {
  /** Groups a device belongs to as a whole. */
  byDevice: Map<string, Group[]>;
  /** Groups that mark a port through one of their cables ("deviceId/portId"). */
  byPort: Map<string, Group[]>;
  byCable: Map<string, Group[]>;
}

const cache = new WeakMap<Project, GroupIndex>();

export function groupIndex(project: Project): GroupIndex {
  let idx = cache.get(project);
  if (idx) return idx;
  idx = { byDevice: new Map(), byPort: new Map(), byCable: new Map() };
  const push = <K,>(map: Map<K, Group[]>, key: K, g: Group) => map.set(key, [...(map.get(key) ?? []), g]);
  for (const g of project.groups) {
    for (const d of g.deviceIds) push(idx.byDevice, d, g);
    for (const cid of g.cableIds) {
      const cable = project.cables.find((c) => c.id === cid);
      if (!cable) continue;
      push(idx.byCable, cid, g);
      for (const e of cable.ends) push(idx.byPort, `${e.deviceId}/${e.portId}`, g);
    }
  }
  cache.set(project, idx);
  return idx;
}

export function useGroupIndex(): GroupIndex {
  return groupIndex(useProjectStore((s) => s.project));
}

/** What the diagram currently emphasises: a traced signal path or a focused system. */
export interface Highlight {
  kind: 'trace' | 'group';
  /** Devices that stay fully visible (anything the highlight touches). */
  deviceIds: Set<string>;
  /** Devices that get the highlight outline (fully part of it). */
  outlinedIds: Set<string>;
  cableIds: Set<string>;
  portKeys: Set<string>;
  color?: string;
}

export function useHighlight(): Highlight | undefined {
  const trace = useTrace();
  const project = useProjectStore((s) => s.project);
  const focusGroupId = useProjectStore((s) => s.focusGroupId);
  if (trace) {
    return { kind: 'trace', deviceIds: trace.deviceIds, outlinedIds: trace.deviceIds, cableIds: trace.cableIds, portKeys: trace.portKeys };
  }
  const group = project.groups.find((g) => g.id === focusGroupId);
  if (!group) return undefined;
  const outlinedIds = new Set(group.deviceIds);
  const deviceIds = new Set(group.deviceIds);
  const portKeys = new Set<string>();
  for (const cid of group.cableIds) {
    const cable = project.cables.find((c) => c.id === cid);
    for (const e of cable?.ends ?? []) {
      portKeys.add(`${e.deviceId}/${e.portId}`);
      deviceIds.add(e.deviceId);
    }
  }
  return { kind: 'group', deviceIds, outlinedIds, cableIds: new Set(group.cableIds), portKeys, color: group.color };
}
