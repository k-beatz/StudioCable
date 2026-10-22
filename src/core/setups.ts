import { connectChain, suggestWiring } from './autowire';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { tidyLayout } from './layout';
import type { Project } from './model';
import { addDevice, addGroup, createProject, setContainer } from './project';

/**
 * Ready-made setups: a few typical rigs built from the generic devices, fully
 * wired, laid out and marked as one system. Added next to whatever is
 * already in the project.
 */

interface SetupDevice {
  /** Key of a generic preset. */
  preset: string;
  name: string;
  /** Name of the pedalboard device this sits on. */
  on?: string;
}

export interface SetupPreset {
  key: string;
  devices: SetupDevice[];
  /** Explicit signal chains (by device name), wired before the automatic suggestion. */
  chains?: string[][];
}

export const SETUP_PRESETS: SetupPreset[] = [
  {
    key: 'homeStudio',
    devices: [
      { preset: 'dynamicMic', name: 'Vocal Mic' },
      { preset: 'interface2x2', name: 'Interface' },
      { preset: 'computer', name: 'Computer' },
      { preset: 'activeMonitor', name: 'Monitor L' },
      { preset: 'activeMonitor', name: 'Monitor R' },
      { preset: 'headphones', name: 'Headphones' },
    ],
  },
  {
    key: 'guitarRig',
    devices: [
      { preset: 'guitar', name: 'Guitar' },
      { preset: 'pedalboard', name: 'Pedalboard' },
      { preset: 'pedalMono', name: 'Overdrive', on: 'Pedalboard' },
      { preset: 'pedalMono', name: 'Delay', on: 'Pedalboard' },
      { preset: 'pedalPsu', name: 'Pedal Power', on: 'Pedalboard' },
      { preset: 'guitarAmp', name: 'Guitar Amp' },
    ],
    chains: [
      ['Overdrive', 'Delay'],
      ['Guitar', 'Pedalboard', 'Guitar Amp'],
      ['Pedal Power', 'Overdrive'],
      ['Pedal Power', 'Delay'],
    ],
  },
  {
    key: 'podcast',
    devices: [
      { preset: 'dynamicMic', name: 'Host Mic' },
      { preset: 'dynamicMic', name: 'Guest Mic' },
      { preset: 'interface2x2', name: 'Interface' },
      { preset: 'computer', name: 'Computer' },
      { preset: 'headphones', name: 'Host Phones' },
    ],
  },
  {
    key: 'synthStudio',
    devices: [
      { preset: 'synth', name: 'Synth 1' },
      { preset: 'synth', name: 'Synth 2' },
      { preset: 'mixer8', name: 'Mixer' },
      { preset: 'interface2x2', name: 'Interface' },
      { preset: 'computer', name: 'Computer' },
      { preset: 'activeMonitor', name: 'Monitor L' },
      { preset: 'activeMonitor', name: 'Monitor R' },
    ],
  },
  {
    key: 'rehearsal',
    devices: [
      { preset: 'dynamicMic', name: 'Vocals' },
      { preset: 'dynamicMic', name: 'Backing Vocals' },
      { preset: 'guitar', name: 'Guitar' },
      { preset: 'guitarAmp', name: 'Guitar Amp' },
      { preset: 'guitar', name: 'Bass' },
      { preset: 'diBox', name: 'Bass DI' },
      { preset: 'synth', name: 'Keys' },
      { preset: 'mixer12', name: 'Mixer' },
      { preset: 'activeMonitor', name: 'PA Left' },
      { preset: 'activeMonitor', name: 'PA Right' },
      { preset: 'headphones', name: 'Headphones' },
    ],
    chains: [['Bass', 'Bass DI', 'Mixer']],
  },
];

const presetSpec = (key: string) => {
  const p = GENERIC_PRESETS.find((x) => x.key === key);
  if (!p) throw new Error(`Unknown preset ${key}`);
  return p.spec;
};

/**
 * Builds a setup into the project. `origin` is the top-left corner of the
 * free area where it should go. Returns the new device IDs.
 */
export function addSetup(
  project: Project,
  setup: SetupPreset,
  name: string,
  origin: { x: number; y: number },
): { project: Project; deviceIds: string[] } {
  // Build it on its own first, so wiring and layout only look at the new devices.
  let p: Project = { ...createProject(), templates: project.templates, nextCableNumber: project.nextCableNumber };
  const ids = new Map<string, string>();
  for (const d of setup.devices) {
    const r = addDevice(p, buildTemplate(presetSpec(d.preset)), d.name, { x: 0, y: 0 });
    p = r.project;
    ids.set(d.name, r.device.id);
  }
  for (const d of setup.devices) {
    if (d.on) p = setContainer(p, ids.get(d.name)!, ids.get(d.on)!);
  }
  for (const chain of setup.chains ?? []) p = connectChain(p, chain.map((n) => ids.get(n)!)).project;
  const mainLevel = setup.devices.filter((d) => !d.on).map((d) => ids.get(d.name)!);
  p = suggestWiring(p, mainLevel).project;
  // Lay out the main level and the inside of every board.
  p = tidyLayout(p, null);
  for (const d of setup.devices) if (d.preset === 'pedalboard') p = tidyLayout(p, ids.get(d.name)!);

  // Copy everything into the real project, shifted to the free area.
  const shiftX = origin.x - Math.min(...p.devices.filter((d) => !d.containerId).map((d) => d.position.x));
  const shiftY = origin.y - Math.min(...p.devices.filter((d) => !d.containerId).map((d) => d.position.y));
  const devices = p.devices.map((d) =>
    d.containerId ? d : { ...d, position: { x: d.position.x + shiftX, y: d.position.y + shiftY } },
  );
  let result: Project = {
    ...project,
    templates: p.templates,
    devices: [...project.devices, ...devices],
    cables: [...project.cables, ...p.cables],
    nextCableNumber: p.nextCableNumber,
  };
  const deviceIds = devices.map((d) => d.id);
  result = addGroup(result, name, { deviceIds, cableIds: p.cables.map((c) => c.id) }).project;
  return { project: result, deviceIds };
}

/** Top-left corner of a free area below everything already on the main level. */
export function freeAreaBelow(project: Project): { x: number; y: number } {
  const main = project.devices.filter((d) => !d.containerId);
  if (main.length === 0) return { x: 0, y: 0 };
  // Device height is not known here; leave generous room below the lowest one.
  return { x: Math.min(...main.map((d) => d.position.x)), y: Math.max(...main.map((d) => d.position.y)) + 520 };
}
