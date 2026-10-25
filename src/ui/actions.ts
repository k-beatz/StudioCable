import { removeCable, removeDevice, updateDevice } from '../core/project';
import { useProjectStore } from '../store/projectStore';
import { play } from './sound';

/** Deletes the selected device or cable. Returns false if nothing deletable is selected. */
export function deleteSelection(): boolean {
  const { selection, apply, select } = useProjectStore.getState();
  if (selection?.kind === 'device') apply((p) => removeDevice(p, selection.id));
  else if (selection?.kind === 'cable') {
    apply((p) => removeCable(p, selection.id));
    play('unplug');
  }
  else return false;
  select(null);
  return true;
}

/** Shows only the used ports of a device (collapsed) or all of them. */
export function setCollapsed(deviceId: string, collapsed: boolean) {
  useProjectStore.getState().apply((p) => updateDevice(p, deviceId, { collapsed: collapsed || undefined }));
}

/** Turns a knob or flips a switch on a device (one undo step). */
export function setControl(deviceId: string, controlId: string, value: string | number) {
  useProjectStore.getState().apply((p) => {
    const device = p.devices.find((d) => d.id === deviceId);
    if (!device || device.settings?.[controlId] === value) return p;
    return updateDevice(p, deviceId, { settings: { ...device.settings, [controlId]: value } });
  });
}

/** Puts all knobs and switches of a device back to their defaults. */
export function resetControls(deviceId: string) {
  useProjectStore.getState().apply((p) => updateDevice(p, deviceId, { settings: undefined }));
}
