import type { CableEnd } from '../core/model';
import { addCable, getPort } from '../core/project';
import { useProjectStore } from '../store/projectStore';

/**
 * Creates a cable between two ports (used by drag-to-connect and tap-to-connect).
 * The cable is stored as output -> input, whichever way it was drawn.
 */
export function connectPorts(a: CableEnd, b: CableEnd): void {
  if (a.deviceId === b.deviceId && a.portId === b.portId) return;
  const { project, apply, select } = useProjectStore.getState();
  let from = a;
  let to = b;
  const fromPort = getPort(project, from);
  const toPort = getPort(project, to);
  if (fromPort?.direction === 'in' || toPort?.direction === 'out') [from, to] = [to, from];
  let newId = '';
  apply((p) => {
    const r = addCable(p, from, to);
    newId = r.cable.id;
    return r.project;
  });
  select({ kind: 'cable', id: newId });
}
