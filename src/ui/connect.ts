import type { CableEnd } from '../core/model';
import { addCable, cableAt, getPort } from '../core/project';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';
import { play } from './sound';

/**
 * Creates a cable between two ports (used by drag-to-connect and tap-to-connect).
 * The cable is stored as output -> input, whichever way it was drawn. It is not
 * selected afterwards, so no side panel pops up while wiring.
 */
export function connectPorts(a: CableEnd, b: CableEnd): void {
  if (a.deviceId === b.deviceId && a.portId === b.portId) return;
  const { project, apply, startConnection, setNotice } = useProjectStore.getState();
  // One jack takes one plug: an occupied port has to be freed first.
  for (const end of [a, b]) {
    const cable = cableAt(project, end);
    if (cable) {
      setNotice(t('connect.occupied', { port: getPort(project, end)?.label ?? '?', cable: cable.label }));
      startConnection(null);
      return;
    }
  }
  let from = a;
  let to = b;
  const fromPort = getPort(project, from);
  const toPort = getPort(project, to);
  if (fromPort?.direction === 'in' || toPort?.direction === 'out') [from, to] = [to, from];
  apply((p) => addCable(p, from, to).project);
  startConnection(null);
  play('plug');
}
