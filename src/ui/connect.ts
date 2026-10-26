import { create } from 'zustand';
import type { CableEnd } from '../core/model';
import { addCable, cableAt, getPort, removeCable, updateCable } from '../core/project';
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

/**
 * Pulling a plug: dragging from a port that has a cable takes that end out.
 * The other end stays plugged in; dropped on a free port the cable is plugged
 * in there (it keeps its name, colour and notes), dropped anywhere else it is
 * removed. Dropped back where it came from, nothing changes.
 */
export interface Pull {
  cableId: string;
  /** The end in the hand. */
  grabbed: CableEnd;
  /** The end that stays plugged in, and where it sits in the diagram (node and handle). */
  fixed: CableEnd;
  fixedNode: string;
  fixedHandle: string;
  /** Screen point where the drag started. */
  startX: number;
  startY: number;
}

export const usePull = create<{ pull: Pull | null; set: (pull: Pull | null) => void }>((set) => ({
  pull: null,
  set: (pull) => set({ pull }),
}));

/** Puts the pulled end into another port (one undo step). */
export function replug(pull: Pull, to: CableEnd): void {
  const { project, apply, setNotice } = useProjectStore.getState();
  if (to.deviceId === pull.grabbed.deviceId && to.portId === pull.grabbed.portId) return;
  if (to.deviceId === pull.fixed.deviceId && to.portId === pull.fixed.portId) return;
  const other = cableAt(project, to);
  if (other) {
    setNotice(t('connect.occupied', { port: getPort(project, to)?.label ?? '?', cable: other.label }));
    return;
  }
  let from = pull.fixed;
  let end = to;
  const fromPort = getPort(project, from);
  const toPort = getPort(project, end);
  if (fromPort?.direction === 'in' || toPort?.direction === 'out') [from, end] = [end, from];
  apply((p) => updateCable(p, pull.cableId, { ends: [from, end] }));
  play('plug');
}

/** Pulls the cable out completely. */
export function unplug(pull: Pull): void {
  const { apply, setNotice } = useProjectStore.getState();
  apply((p) => removeCable(p, pull.cableId));
  setNotice(t('connect.unplugged'));
}
