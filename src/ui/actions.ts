import { removeCable, removeDevice, updateDevice } from '../core/project';
import { useProjectStore } from '../store/projectStore';

/** Deletes the selected device or cable. Returns false if nothing deletable is selected. */
export function deleteSelection(): boolean {
  const { selection, apply, select } = useProjectStore.getState();
  if (selection?.kind === 'device') apply((p) => removeDevice(p, selection.id));
  else if (selection?.kind === 'cable') apply((p) => removeCable(p, selection.id));
  else return false;
  select(null);
  return true;
}

/** Shows only the used ports of a device (collapsed) or all of them. */
export function setCollapsed(deviceId: string, collapsed: boolean) {
  useProjectStore.getState().apply((p) => updateDevice(p, deviceId, { collapsed: collapsed || undefined }));
}
