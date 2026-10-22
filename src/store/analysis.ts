import type { Project } from '../core/model';
import { isPowerCable } from '../core/power';
import { checkProject, computeOccupancy, type Issue } from '../core/validation';
import { useProjectStore } from './projectStore';

export interface Analysis {
  issues: Issue[];
  byCable: Map<string, Issue[]>;
  /** "deviceId/portId" -> number of cables on that port. */
  occupancy: Map<string, number>;
}

// Projects are immutable, so results can be cached per project object.
const cache = new WeakMap<Project, Analysis>();

export function analyze(project: Project): Analysis {
  let result = cache.get(project);
  if (!result) {
    const issues = checkProject(project);
    const byCable = new Map<string, Issue[]>();
    for (const issue of issues) byCable.set(issue.cableId, [...(byCable.get(issue.cableId) ?? []), issue]);
    result = { issues, byCable, occupancy: computeOccupancy(project) };
    cache.set(project, result);
  }
  return result;
}

const withoutPower = new WeakMap<Project, Analysis>();

/** Like analyze(), but without the issues of power cables (when the power layer is hidden). */
function analyzeWithoutPower(project: Project): Analysis {
  let result = withoutPower.get(project);
  if (!result) {
    const full = analyze(project);
    const power = new Set(project.cables.filter((c) => isPowerCable(project, c)).map((c) => c.id));
    result = { ...full, issues: full.issues.filter((i) => !power.has(i.cableId)) };
    withoutPower.set(project, result);
  }
  return result;
}

export function useAnalysis(): Analysis {
  const project = useProjectStore((s) => s.project);
  const showPower = useProjectStore((s) => s.showPower);
  return showPower ? analyze(project) : analyzeWithoutPower(project);
}
