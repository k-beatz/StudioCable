import { newId } from './ids';
import type {
  Connector,
  DeviceCategory,
  DeviceTemplate,
  Direction,
  InternalRoute,
  Port,
  SignalType,
  TemplateOrigin,
} from './model';

/**
 * Generic devices are built from "port groups": e.g. 8 x "Input" XLR mic.
 * The same description drives the presets and the quick device dialog.
 */
export interface PortGroup {
  count: number;
  /** Label prefix; numbered automatically when count > 1 ("Input 1", "Input 2"). */
  label: string;
  /** Explicit labels as printed on the device; overrides count and label. */
  labels?: string[];
  direction: Direction;
  connectors: Connector[];
  signal: SignalType;
  alsoAccepts?: SignalType[];
  channels?: number;
}

export interface GenericSpec {
  manufacturer: string;
  model: string;
  category: DeviceCategory;
  groups: PortGroup[];
  /** Internal paths by port label (e.g. preamp in -> out). */
  routing?: { from: string; to: string; breakWhenPatched?: string[] }[];
}

export function portLabels(g: PortGroup): string[] {
  if (g.labels) return g.labels;
  return Array.from({ length: Math.max(0, g.count) }, (_, i) => (g.count > 1 ? `${g.label} ${i + 1}` : g.label));
}

export function buildTemplate(spec: GenericSpec, origin: TemplateOrigin = 'generic'): DeviceTemplate {
  const ports: Port[] = spec.groups.flatMap((g) =>
    portLabels(g).map((label) => ({
      id: newId('port-'),
      label,
      direction: g.direction,
      connectors: g.connectors.map((c) => ({ ...c })),
      signal: g.signal,
      ...(g.alsoAccepts?.length ? { alsoAccepts: [...g.alsoAccepts] } : {}),
      ...(g.channels && g.channels > 1 ? { channels: g.channels } : {}),
    })),
  );
  const byLabel = new Map(ports.map((p) => [p.label, p.id]));
  const routing: InternalRoute[] = (spec.routing ?? []).flatMap((r) => {
    const from = byLabel.get(r.from);
    const to = byLabel.get(r.to);
    if (!from || !to) return [];
    const breaks = (r.breakWhenPatched ?? []).flatMap((l) => byLabel.get(l) ?? []);
    return [breaks.length ? { from, to, breakWhenPatched: breaks } : { from, to }];
  });
  return {
    id: newId('t-'),
    manufacturer: spec.manufacturer,
    model: spec.model,
    category: spec.category,
    ports,
    ...(routing.length ? { routing } : {}),
    origin,
  };
}

// ---------- Presets ----------

const F = 'female' as const;
const M = 'male' as const;
const N = 'none' as const;
const combo: Connector[] = [
  { type: 'xlr', gender: F },
  { type: 'trs-6.3', gender: F },
];

const comboAccepts: SignalType[] = ['line-bal', 'line-unbal', 'instrument'];

/** Routes "In n" -> "Out n" for n = 1..count. */
function channelRoutes(count: number, inLabel: string, outLabel: string) {
  return Array.from({ length: count }, (_, i) => ({
    from: count > 1 ? `${inLabel} ${i + 1}` : inLabel,
    to: count > 1 ? `${outLabel} ${i + 1}` : outLabel,
  }));
}

/**
 * Half-normalled patchbay: top rear feeds bottom rear until something is
 * plugged into bottom front. Top front taps the top signal without breaking it.
 */
function halfNormalled(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return [
      { from: `Top Rear ${n}`, to: `Bottom Rear ${n}`, breakWhenPatched: [`Bottom Front ${n}`] },
      { from: `Top Rear ${n}`, to: `Top Front ${n}` },
      { from: `Bottom Front ${n}`, to: `Bottom Rear ${n}` },
    ];
  }).flat();
}

export const GENERIC_PRESETS: { key: string; spec: GenericSpec }[] = [
  {
    key: 'interface2x2',
    spec: {
      manufacturer: 'Generic',
      model: '2-in/2-out USB Interface',
      category: 'interface',
      groups: [
        { count: 2, label: 'Input', direction: 'in', connectors: combo, signal: 'mic', alsoAccepts: comboAccepts },
        { count: 2, label: 'Output', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
        { count: 1, label: 'Phones', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'headphone', channels: 2 },
        { count: 1, label: 'USB', direction: 'bidi', connectors: [{ type: 'usb-c', gender: F }], signal: 'data' },
      ],
    },
  },
  {
    key: 'interface8x8',
    spec: {
      manufacturer: 'Generic',
      model: '8-in/8-out Interface with ADAT',
      category: 'interface',
      groups: [
        { count: 8, label: 'Input', direction: 'in', connectors: combo, signal: 'mic', alsoAccepts: comboAccepts },
        { count: 8, label: 'Line Out', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
        { count: 2, label: 'Phones', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'headphone', channels: 2 },
        { count: 1, label: 'ADAT In', direction: 'in', connectors: [{ type: 'toslink', gender: N }], signal: 'digital-audio', channels: 8 },
        { count: 1, label: 'ADAT Out', direction: 'out', connectors: [{ type: 'toslink', gender: N }], signal: 'digital-audio', channels: 8 },
        { count: 1, label: 'Word Clock Out', direction: 'out', connectors: [{ type: 'bnc', gender: F }], signal: 'clock' },
        { count: 1, label: 'MIDI In', direction: 'in', connectors: [{ type: 'midi-din', gender: F }], signal: 'midi' },
        { count: 1, label: 'MIDI Out', direction: 'out', connectors: [{ type: 'midi-din', gender: F }], signal: 'midi' },
        { count: 1, label: 'USB', direction: 'bidi', connectors: [{ type: 'usb-c', gender: F }], signal: 'data' },
      ],
    },
  },
  {
    key: 'preamp2',
    spec: {
      manufacturer: 'Generic',
      model: '2-Channel Mic Preamp',
      category: 'preamp',
      groups: [
        { count: 2, label: 'Mic In', direction: 'in', connectors: [{ type: 'xlr', gender: F }], signal: 'mic' },
        { count: 2, label: 'Out', direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'line-bal' },
      ],
      routing: channelRoutes(2, 'Mic In', 'Out'),
    },
  },
  {
    key: 'compressor2',
    spec: {
      manufacturer: 'Generic',
      model: 'Stereo Compressor',
      category: 'outboard',
      groups: [
        { count: 2, label: 'In', direction: 'in', connectors: combo, signal: 'line-bal' },
        { count: 2, label: 'Out', direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'line-bal' },
      ],
      routing: channelRoutes(2, 'In', 'Out'),
    },
  },
  {
    key: 'diBox',
    spec: {
      manufacturer: 'Generic',
      model: 'Passive DI Box',
      category: 'di-box',
      groups: [
        { count: 1, label: 'Input', direction: 'in', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument' },
        { count: 1, label: 'Thru', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument' },
        { count: 1, label: 'Output', direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'mic' },
      ],
      routing: [
        { from: 'Input', to: 'Thru' },
        { from: 'Input', to: 'Output' },
      ],
    },
  },
  {
    key: 'mixer8',
    spec: {
      manufacturer: 'Generic',
      model: '8-Channel Mixer',
      category: 'mixer',
      groups: [
        { count: 8, label: 'Mic In', direction: 'in', connectors: [{ type: 'xlr', gender: F }], signal: 'mic' },
        { count: 8, label: 'Line In', direction: 'in', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
        { count: 2, label: 'Main Out', direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'line-bal' },
        { count: 2, label: 'Aux Send', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
        { count: 1, label: 'Phones', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'headphone', channels: 2 },
      ],
    },
  },
  {
    key: 'patchbay24',
    spec: {
      manufacturer: 'Generic',
      model: 'Patchbay 24 points (half-normalled)',
      category: 'patchbay',
      groups: [
        { count: 24, label: 'Top Rear', direction: 'in', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
        { count: 24, label: 'Bottom Front', direction: 'in', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
        { count: 24, label: 'Bottom Rear', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
        { count: 24, label: 'Top Front', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
      ],
      routing: halfNormalled(24),
    },
  },
  {
    key: 'activeMonitor',
    spec: {
      manufacturer: 'Generic',
      model: 'Active Studio Monitor',
      category: 'monitor',
      groups: [{ count: 1, label: 'Input', direction: 'in', connectors: combo, signal: 'line-bal' }],
    },
  },
  {
    key: 'headphones',
    spec: {
      manufacturer: 'Generic',
      model: 'Headphones',
      category: 'headphones',
      groups: [
        { count: 1, label: 'Plug', direction: 'in', connectors: [{ type: 'trs-6.3', gender: M }], signal: 'headphone', channels: 2 },
      ],
    },
  },
  {
    key: 'dynamicMic',
    spec: {
      manufacturer: 'Generic',
      model: 'Microphone',
      category: 'microphone',
      groups: [{ count: 1, label: 'Out', direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'mic' }],
    },
  },
  {
    key: 'guitar',
    spec: {
      manufacturer: 'Generic',
      model: 'Electric Guitar / Bass',
      category: 'instrument',
      groups: [{ count: 1, label: 'Out', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument' }],
    },
  },
  {
    key: 'synth',
    spec: {
      manufacturer: 'Generic',
      model: 'Synthesizer',
      category: 'instrument',
      groups: [
        { count: 1, label: 'Out L', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'line-unbal' },
        { count: 1, label: 'Out R', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'line-unbal' },
        { count: 1, label: 'MIDI In', direction: 'in', connectors: [{ type: 'midi-din', gender: F }], signal: 'midi' },
        { count: 1, label: 'MIDI Out', direction: 'out', connectors: [{ type: 'midi-din', gender: F }], signal: 'midi' },
      ],
    },
  },
  {
    key: 'pedalboard',
    spec: { manufacturer: 'Generic', model: 'Pedalboard', category: 'pedalboard', groups: [] },
  },
  {
    key: 'pedalMono',
    spec: {
      manufacturer: 'Generic',
      model: 'Effect pedal',
      category: 'pedal',
      groups: [
        { count: 1, label: 'Input', direction: 'in', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument', alsoAccepts: ['line-unbal'] },
        { count: 1, label: 'Output', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument' },
      ],
      routing: [{ from: 'Input', to: 'Output' }],
    },
  },
  {
    key: 'pedalStereo',
    spec: {
      manufacturer: 'Generic',
      model: 'Stereo effect pedal',
      category: 'pedal',
      groups: [
        { count: 1, label: 'Input', direction: 'in', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument', alsoAccepts: ['line-unbal'] },
        { count: 1, label: 'Output L', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument' },
        { count: 1, label: 'Output R', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument' },
      ],
      routing: [
        { from: 'Input', to: 'Output L' },
        { from: 'Input', to: 'Output R' },
      ],
    },
  },
  {
    key: 'guitarAmp',
    spec: {
      manufacturer: 'Generic',
      model: 'Guitar amp',
      category: 'amp',
      groups: [
        { count: 1, label: 'Input', direction: 'in', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'instrument' },
        { count: 1, label: 'FX Return', direction: 'in', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'line-unbal' },
        { count: 1, label: 'FX Send', direction: 'out', connectors: [{ type: 'ts-6.3', gender: F }], signal: 'line-unbal' },
        { count: 1, label: 'Line Out', direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'line-bal' },
      ],
      // Effects loop: Input feeds FX Send; FX Return feeds the outputs. Without a
      // cable in FX Return the loop is bridged internally.
      routing: [
        { from: 'Input', to: 'FX Send' },
        { from: 'FX Return', to: 'Line Out' },
        { from: 'Input', to: 'Line Out', breakWhenPatched: ['FX Return'] },
      ],
    },
  },
  {
    key: 'computer',
    spec: {
      manufacturer: 'Generic',
      model: 'Computer',
      category: 'computer',
      groups: [{ count: 2, label: 'USB', direction: 'bidi', connectors: [{ type: 'usb-c', gender: F }], signal: 'data' }],
    },
  },
];

/** Sensible default gender for a connector on a device panel. */
export function defaultConnector(type: Connector['type'], direction: Direction): Connector {
  if (type === 'toslink' || type === 'rj45' || type === 'dsub25') return { type, gender: type === 'dsub25' ? 'female' : 'none' };
  if (type === 'xlr' || type === 'aes-xlr') return { type, gender: direction === 'out' ? 'male' : 'female' };
  return { type, gender: 'female' };
}
