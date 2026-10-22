import { useReactFlow } from '@xyflow/react';
import { suggestWiring } from '../core/autowire';
import { shownDevices, tidyLayout, type Size } from '../core/layout';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';

/**
 * Actions of the Tools and Helper menus. They work on the diagram level that
 * is currently shown (main level or an open pedalboard).
 */
export function useDiagramActions() {
  const flow = useReactFlow();

  /** "Tidy up": sort the devices of this level by signal flow, then frame them. */
  const tidyUp = () => {
    const { apply, openBoardId } = useProjectStore.getState();
    const sizes = new Map<string, Size>();
    for (const n of flow.getNodes()) {
      if (n.measured?.width && n.measured.height) sizes.set(n.id, { width: n.measured.width, height: n.measured.height });
    }
    apply((p) => tidyLayout(p, openBoardId, sizes));
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 400 }), 60);
  };

  /** "Suggest wiring": wire everything on screen; the new cables stay highlighted until kept or removed. */
  const suggest = () => {
    const { project, openBoardId, showPower, apply, setNotice, setSuggestedCables } = useProjectStore.getState();
    const ids = shownDevices(project, openBoardId, showPower).map((d) => d.id);
    const result = suggestWiring(project, ids);
    if (!result.added.length) {
      setNotice(t('tool.suggestedNone'));
      return;
    }
    apply(() => result.project);
    setSuggestedCables(result.added);
  };

  return { tidyUp, suggest };
}
