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
  /** Pedalboard currently opened in the diagram (null = main level). */
  openBoardId: string | null;
  /** System (group) currently highlighted. */
  focusGroupId: string | null;
  /** Tap-to-connect: the port a new cable starts from, waiting for the second tap. */
  pendingConnection: { deviceId: string; portId: string } | null;

  /** Apply an edit and record it for undo. */
  apply: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  replaceProject: (p: Project) => void;
  select: (s: Selection) => void;
  setShowSignalFlow: (on: boolean) => void;
  setCableStyle: (style: CableStyle) => void;
  setDimUnusedPorts: (on: boolean) => void;
  openBoard: (id: string | null) => void;
  setFocusGroup: (id: string | null) => void;
  startConnection: (from: { deviceId: string; portId: string } | null) => void;
}

export type CableStyle = 'orthogonal' | 'curved';

const PREFS_KEY = 'studiocable.prefs';

function loadPrefs(): { cableStyle: CableStyle; dimUnusedPorts: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      cableStyle: raw.cableStyle === 'curved' ? 'curved' : 'orthogonal',
      dimUnusedPorts: raw.dimUnusedPorts === true,
    };
  } catch {
    return { cableStyle: 'orthogonal', dimUnusedPorts: false };
  }
}

function savePrefs(prefs: { cableStyle: CableStyle; dimUnusedPorts: boolean }) {
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
    savePrefs({ cableStyle, dimUnusedPorts: get().dimUnusedPorts });
  },
  setDimUnusedPorts: (dimUnusedPorts) => {
    set({ dimUnusedPorts });
    savePrefs({ cableStyle: get().cableStyle, dimUnusedPorts });
  },
  openBoard: (openBoardId) => {
    blurActiveField();
    set({ openBoardId, selection: null, pendingConnection: null });
  },
  startConnection: (pendingConnection) => set({ pendingConnection }),
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
