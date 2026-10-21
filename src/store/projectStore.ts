import { create } from 'zustand';
import type { Project } from '../core/model';
import { createProject, parseProject, serializeProject } from '../core/project';

/**
 * App state with undo/redo. Because every core operation returns a new
 * Project, history is just a list of previous project snapshots.
 */

const HISTORY_LIMIT = 200;
const AUTOSAVE_KEY = 'studiocable.autosave';

export type Selection = { kind: 'device' | 'cable'; id: string } | null;

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection;

  /** Apply an edit and record it for undo. */
  apply: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  replaceProject: (p: Project) => void;
  select: (s: Selection) => void;
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
  replaceProject: (p) => set({ project: p, past: [], future: [], selection: null }),
  select: (selection) => set({ selection }),
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
