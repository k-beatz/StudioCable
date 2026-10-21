import type { Project } from '../core/model';
import { traceFromCable, traceFromDevice, traceFromPort, type Trace } from '../core/signalFlow';
import { useProjectStore, type Selection } from './projectStore';

// One cached trace per project snapshot and selection.
const cache = new WeakMap<Project, Map<string, Trace | undefined>>();

export function traceForSelection(project: Project, selection: Selection): Trace | undefined {
  if (!selection || selection.kind === 'group') return undefined;
  const key = JSON.stringify(selection);
  let byKey = cache.get(project);
  if (!byKey) cache.set(project, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);

  let trace: Trace | undefined;
  if (selection.kind === 'cable') trace = traceFromCable(project, selection.id);
  else if (selection.kind === 'port') trace = traceFromPort(project, { deviceId: selection.id, portId: selection.portId });
  else {
    const device = project.devices.find((d) => d.id === selection.id);
    trace = device ? traceFromDevice(project, device) : undefined;
  }
  byKey.set(key, trace);
  return trace;
}

/** The signal flow of the current selection, if highlighting is on. */
export function useTrace(): Trace | undefined {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const on = useProjectStore((s) => s.showSignalFlow);
  return on ? traceForSelection(project, selection) : undefined;
}
