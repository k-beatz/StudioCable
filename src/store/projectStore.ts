import { create } from 'zustand';
import type { Project } from '../core/model';
import { createProject, parseProject, serializeProject } from '../core/project';
import { blurActiveField } from '../ui/device';

/**
 * App state with undo/redo. Because every core operation returns a new
 * Project, history is just a list of previous project snapshots.
 */

const HISTORY_LIMIT = 200;
const AUTOSAVE_KEY = 'studiocable.autosave';

export type Selection =
  | { kind: 'device' | 'cable'; id: string }
  /** `id` is the device, `portId` the port on it. */
  | { kind: 'port'; id: string; portId: string }
  | { kind: 'group'; id: string }
  | null;

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection;
  /** Highlight the signal flow of the current selection. */
  showSignalFlow: boolean;
  /** View preferences (remembered on this device, not stored in the project). */
  cableStyle: CableStyle;
  dimUnusedPorts: boolean;
  /** Show the power layer (power supplies, outlets, power cables and power inputs). */
  showPower: boolean;
  /** Overall look of the diagram: "modular" (coloured hardware panels) or "clean". */
  look: Look;
  /** Pedalboard currently opened in the diagram (null = main level). */
  openBoardId: string | null;
  /** System (group) currently highlighted. */
  focusGroupId: string | null;
  /** Tap-to-connect: the port a new cable starts from, waiting for the second tap. */
  pendingConnection: { deviceId: string; portId: string } | null;
  /** Short message shown at the bottom of the screen (e.g. after an automatic action). */
  notice: string | null;

  /** Apply an edit and record it for undo. */
  apply: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  replaceProject: (p: Project) => void;
  select: (s: Selection) => void;
  setShowSignalFlow: (on: boolean) => void;
  setCableStyle: (style: CableStyle) => void;
  setDimUnusedPorts: (on: boolean) => void;
  setShowPower: (on: boolean) => void;
  setLook: (look: Look) => void;
  openBoard: (id: string | null) => void;
  setFocusGroup: (id: string | null) => void;
  startConnection: (from: { deviceId: string; portId: string } | null) => void;
  setNotice: (text: string | null) => void;
}

export type CableStyle = 'orthogonal' | 'curved' | 'hanging';
export type Look = 'modular' | 'clean';

const PREFS_KEY = 'studiocable.prefs';

const currentPrefs = (s: Prefs): Prefs => ({
  cableStyle: s.cableStyle,
  dimUnusedPorts: s.dimUnusedPorts,
  showPower: s.showPower,
  look: s.look,
});

interface Prefs {
  cableStyle: CableStyle;
  dimUnusedPorts: boolean;
  showPower: boolean;
  look: Look;
}

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      cableStyle: (['curved', 'hanging'] as const).find((c) => c === raw.cableStyle) ?? 'orthogonal',
      dimUnusedPorts: raw.dimUnusedPorts === true,
      showPower: raw.showPower === true,
      look: raw.look === 'clean' ? 'clean' : 'modular',
    };
  } catch {
    return { cableStyle: 'orthogonal', dimUnusedPorts: false, showPower: false, look: 'modular' };
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not critical.
  }
}

function loadAutosave(): Project {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) return parseProject(saved);
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return createProject();
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: loadAutosave(),
  past: [],
  future: [],
  selection: null,
  showSignalFlow: true,
  ...loadPrefs(),
  openBoardId: null,
  focusGroupId: null,
  pendingConnection: null,
  notice: null,

  apply: (fn) => {
    const { project, past } = get();
    const next = fn(project);
    if (next === project) return;
    set({ project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
  },
  undo: () => {
    const { project, past, future } = get();
    const prev = past.at(-1);
    if (!prev) return;
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
  },
  redo: () => {
    const { project, past, future } = get();
    const next = future[0];
    if (!next) return;
    set({ project: next, past: [...past, project], future: future.slice(1) });
  },
  replaceProject: (p) => set({ project: p, past: [], future: [], selection: null, openBoardId: null, focusGroupId: null }),
  select: (selection) => {
    blurActiveField();
    set({ selection, pendingConnection: null });
  },
  setShowSignalFlow: (showSignalFlow) => set({ showSignalFlow }),
  setCableStyle: (cableStyle) => {
    set({ cableStyle });
    savePrefs({ ...currentPrefs(get()), cableStyle });
  },
  setDimUnusedPorts: (dimUnusedPorts) => {
    set({ dimUnusedPorts });
    savePrefs({ ...currentPrefs(get()), dimUnusedPorts });
  },
  setShowPower: (showPower) => {
    set({ showPower });
    savePrefs({ ...currentPrefs(get()), showPower });
  },
  setLook: (look) => {
    set({ look });
    savePrefs({ ...currentPrefs(get()), look });
  },
  openBoard: (openBoardId) => {
    blurActiveField();
    set({ openBoardId, selection: null, pendingConnection: null });
  },
  startConnection: (pendingConnection) => set({ pendingConnection }),
  setNotice: (notice) => set({ notice }),
  setFocusGroup: (focusGroupId) => set({ focusGroupId }),
}));

// Autosave (debounced) whenever the project changes.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useProjectStore.subscribe((state, prev) => {
  if (state.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeProject(state.project));
    } catch {
      // Ignore: storage may be full or blocked.
    }
  }, 500);
});
