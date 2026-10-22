import type { CableEnd } from '../core/model';
import { addCable, getPort } from '../core/project';
import { useProjectStore } from '../store/projectStore';

/**
 * Creates a cable between two ports (used by drag-to-connect and tap-to-connect).
 * The cable is stored as output -> input, whichever way it was drawn. It is not
 * selected afterwards, so no side panel pops up while wiring.
 */
export function connectPorts(a: CableEnd, b: CableEnd): void {
  if (a.deviceId === b.deviceId && a.portId === b.portId) return;
  const { project, apply, startConnection } = useProjectStore.getState();
  let from = a;
  let to = b;
  const fromPort = getPort(project, from);
  const toPort = getPort(project, to);
  if (fromPort?.direction === 'in' || toPort?.direction === 'out') [from, to] = [to, from];
  apply((p) => addCable(p, from, to).project);
  startConnection(null);
}
