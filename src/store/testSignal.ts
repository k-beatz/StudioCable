import { create } from 'zustand';
import { testSignal, type TestResult } from '../core/testSignal';
import { useProjectStore } from './projectStore';

export type TestSound = 'music' | 'tone' | 'noise';
export const TEST_SOUNDS: TestSound[] = ['music', 'tone', 'noise'];

/** The test signal being played right now (one source at a time). */
interface State {
  sourceId: string | null;
  sound: TestSound;
  start: (sourceId: string) => void;
  stop: () => void;
  setSound: (sound: TestSound) => void;
}

export const useTestSignal = create<State>((set) => ({
  sourceId: null,
  sound: 'music',
  start: (sourceId) => set({ sourceId }),
  stop: () => set({ sourceId: null }),
  setSound: (sound) => set({ sound }),
}));

// One cached result per project snapshot and source.
const cache = new WeakMap<object, Map<string, TestResult>>();

export function testResultFor(project: Parameters<typeof testSignal>[0], sourceId: string): TestResult {
  let bySource = cache.get(project);
  if (!bySource) cache.set(project, (bySource = new Map()));
  let r = bySource.get(sourceId);
  if (!r) bySource.set(sourceId, (r = testSignal(project, sourceId)));
  return r;
}

/** Where the running test signal goes, recomputed whenever the plan (a knob, a cable) changes. */
export function useTestResult(): TestResult | undefined {
  const sourceId = useTestSignal((s) => s.sourceId);
  const project = useProjectStore((s) => s.project);
  if (!sourceId || !project.devices.some((d) => d.id === sourceId)) return undefined;
  return testResultFor(project, sourceId);
}
