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
  /** View preferences (remembered on this device, not stored in the project). */
  cableStyle: CableStyle;
  dimUnusedPorts: boolean;
  /** Show the power layer (power supplies, outlets, power cables and power inputs). */
  showPower: boolean;
  /** Show knobs and switches on the devices that have them. */
  showControls: boolean;
  /** Show sticky notes and the note pad. */
  showNotes: boolean;
  /** Subtle sounds (plugging cables, knobs, switches). */
  sound: boolean;
  /** Sticky note open in the editor. */
  editingNoteId: string | null;
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
  /** Active diagram tool: draw a chain, or cut cables. */
  tool: Tool | null;
  /** Cables just added by "suggest wiring", highlighted until kept or removed. */
  suggestedCables: string[] | null;

  /** Apply an edit and record it for undo. */
  apply: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  replaceProject: (p: Project) => void;
  select: (s: Selection) => void;
  setCableStyle: (style: CableStyle) => void;
  setDimUnusedPorts: (on: boolean) => void;
  setShowPower: (on: boolean) => void;
  setShowControls: (on: boolean) => void;
  setShowNotes: (on: boolean) => void;
  setSound: (on: boolean) => void;
  setEditingNote: (id: string | null) => void;
  setLook: (look: Look) => void;
  openBoard: (id: string | null) => void;
  setFocusGroup: (id: string | null) => void;
  startConnection: (from: { deviceId: string; portId: string } | null) => void;
  setNotice: (text: string | null) => void;
  setTool: (tool: Tool | null) => void;
  setSuggestedCables: (ids: string[] | null) => void;
}

export type CableStyle = 'orthogonal' | 'curved' | 'hanging';
export type Tool = 'chain' | 'cut';
export type Look = 'modular' | 'clean';

const PREFS_KEY = 'studiocable.prefs';

const currentPrefs = (s: Prefs): Prefs => ({
  cableStyle: s.cableStyle,
  dimUnusedPorts: s.dimUnusedPorts,
  showPower: s.showPower,
  showControls: s.showControls,
  showNotes: s.showNotes,
  sound: s.sound,
  look: s.look,
});

interface Prefs {
  cableStyle: CableStyle;
  dimUnusedPorts: boolean;
  showPower: boolean;
  showControls: boolean;
  showNotes: boolean;
  sound: boolean;
  look: Look;
}

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      cableStyle: (['curved', 'hanging'] as const).find((c) => c === raw.cableStyle) ?? 'orthogonal',
      dimUnusedPorts: raw.dimUnusedPorts === true,
      showPower: raw.showPower === true,
      showControls: raw.showControls !== false,
      showNotes: raw.showNotes !== false,
      sound: raw.sound !== false,
      look: raw.look === 'clean' ? 'clean' : 'modular',
    };
  } catch {
    return { cableStyle: 'orthogonal', dimUnusedPorts: false, showPower: false, showControls: true, showNotes: true, sound: true, look: 'modular' };
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
  ...loadPrefs(),
  openBoardId: null,
  focusGroupId: null,
  pendingConnection: null,
  notice: null,
  tool: null,
  suggestedCables: null,
  editingNoteId: null,

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
  setShowControls: (showControls) => {
    set({ showControls });
    savePrefs({ ...currentPrefs(get()), showControls });
  },
  setShowNotes: (showNotes) => {
    set({ showNotes });
    savePrefs({ ...currentPrefs(get()), showNotes });
  },
  setEditingNote: (editingNoteId) => set({ editingNoteId }),
  setSound: (sound) => {
    set({ sound });
    savePrefs({ ...currentPrefs(get()), sound });
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
  setTool: (tool) => {
    blurActiveField();
    set({ tool, selection: tool ? null : get().selection, pendingConnection: null });
  },
  setSuggestedCables: (suggestedCables) => set({ suggestedCables }),
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
