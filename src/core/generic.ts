import { newId } from './ids';
import type {
  Control,
  Connector,
  DeviceCategory,
  DeviceTemplate,
  Direction,
  InternalRoute,
  Port,
  RouteCondition,
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
  needsPhantom?: boolean;
}

export interface GenericSpec {
  manufacturer: string;
  model: string;
  category: DeviceCategory;
  groups: PortGroup[];
  /** Internal paths by port label (e.g. preamp in -> out). */
  routing?: { from: string; to: string; breakWhenPatched?: string[]; when?: RouteCondition[] }[];
  /** Knobs and switches; `levelOf` by port label. */
  controls?: Control[];
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
      ...(g.needsPhantom ? { needsPhantom: true } : {}),
    })),
  );
  const byLabel = new Map(ports.map((p) => [p.label, p.id]));
  const routing: InternalRoute[] = (spec.routing ?? []).flatMap((r) => {
    const from = byLabel.get(r.from);
    const to = byLabel.get(r.to);
    if (!from || !to) return [];
    const breaks = (r.breakWhenPatched ?? []).flatMap((l) => byLabel.get(l) ?? []);
    return [{ from, to, ...(breaks.length ? { breakWhenPatched: breaks } : {}), ...(r.when?.length ? { when: r.when.map((c) => ({ ...c })) } : {}) }];
  });
  const controls: Control[] = (spec.controls ?? []).map((c) => ({
    ...c,
    ...(c.positions ? { positions: [...c.positions] } : {}),
    ...(c.levelOf ? { levelOf: c.levelOf.flatMap((l) => byLabel.get(l) ?? []) } : {}),
    ...(c.phantomFor ? { phantomFor: c.phantomFor.flatMap((l) => byLabel.get(l) ?? []) } : {}),
    ...(c.onFor ? { onFor: c.onFor.flatMap((l) => byLabel.get(l) ?? []) } : {}),
  }));
  return {
    id: newId('t-'),
    manufacturer: spec.manufacturer,
    model: spec.model,
    category: spec.category,
    ports,
    ...(routing.length ? { routing } : {}),
    ...(controls.length ? { controls } : {}),
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

// Typical power inputs, used by the generic presets below.
const mainsInlet: PortGroup = { count: 1, label: 'Power', direction: 'in', connectors: [{ type: 'iec', gender: M }], signal: 'power-ac' };
const dcInput: PortGroup = { count: 1, label: 'DC In', direction: 'in', connectors: [{ type: 'dc-barrel', gender: F }], signal: 'power-dc' };

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

/** Labels for stereo line channels, e.g. first=5, pairs=2 -> "Stereo In 5/6 L", "Stereo In 5/6 R", "Stereo In 7/8 L", … */
function stereoLabels(first: number, pairs: number): string[] {
  return Array.from({ length: pairs }, (_, i) => {
    const a = first + i * 2;
    return [`Stereo In ${a}/${a + 1} L`, `Stereo In ${a}/${a + 1} R`];
  }).flat();
}

/** A rough generic mixer: mono mic/line channels, stereo line channels and the usual outputs. */
function genericMixer(model: string, mono: number, stereoPairs: number, auxSends: number, controlRoom: boolean): GenericSpec {
  return {
    manufacturer: 'Generic',
    model,
    category: 'mixer',
    groups: [
      { count: mono, label: 'Mic In', direction: 'in', connectors: [{ type: 'xlr', gender: F }], signal: 'mic' },
      { count: mono, label: 'Line In', direction: 'in', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'line-bal' },
      ...(stereoPairs > 0
        ? [
            {
              count: stereoPairs * 2,
              label: 'Stereo In',
              labels: stereoLabels(mono + 1, stereoPairs),
              direction: 'in' as const,
              connectors: [{ type: 'trs-6.3' as const, gender: F }],
              signal: 'line-unbal' as const,
            },
          ]
        : []),
      { count: 2, label: 'Main Out', labels: ['Main Out L', 'Main Out R'], direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'line-bal' },
      ...(auxSends > 0
        ? [{ count: auxSends, label: 'Aux Send', direction: 'out' as const, connectors: [{ type: 'trs-6.3' as const, gender: F }], signal: 'line-bal' as const }]
        : []),
      ...(controlRoom
        ? [{ count: 2, label: 'Control Room', labels: ['Control Room L', 'Control Room R'], direction: 'out' as const, connectors: [{ type: 'trs-6.3' as const, gender: F }], signal: 'line-bal' as const }]
        : []),
      { count: 1, label: 'Phones', direction: 'out', connectors: [{ type: 'trs-6.3', gender: F }], signal: 'headphone', channels: 2 },
    ],
  };
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
  { key: 'mixer4', spec: genericMixer('Compact 4-Channel Mixer', 2, 1, 1, false) },
  { key: 'mixer12', spec: genericMixer('12-Channel Mixer', 4, 4, 2, true) },
  { key: 'mixer16', spec: genericMixer('16-Channel Mixer', 16, 0, 4, true) },
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
      groups: [{ count: 1, label: 'Input', direction: 'in', connectors: combo, signal: 'line-bal' }, mainsInlet],
    },
  },
  {
    key: 'passiveSpeaker',
    spec: {
      manufacturer: 'Generic',
      model: 'Passive Speaker',
      category: 'monitor',
      groups: [{ count: 1, label: 'Speaker In', direction: 'in', connectors: [{ type: 'spring-clip', gender: F }], signal: 'speaker' }],
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
    key: 'condenserMic',
    spec: {
      manufacturer: 'Generic',
      model: 'Condenser Microphone',
      category: 'microphone',
      groups: [{ count: 1, label: 'Out', direction: 'out', connectors: [{ type: 'xlr', gender: M }], signal: 'mic', needsPhantom: true }],
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
    key: 'turntable',
    spec: {
      manufacturer: 'Generic',
      model: 'Turntable (MM)',
      category: 'instrument',
      groups: [{ count: 0, label: '', labels: ['Out L', 'Out R'], direction: 'out', connectors: [{ type: 'rca', gender: F }], signal: 'phono' }],
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
        dcInput,
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
        dcInput,
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
        dcInput,
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
        mainsInlet,
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
  // ---------- Power (shown when the power layer is on) ----------
  {
    key: 'wallOutlet',
    spec: {
      manufacturer: 'Generic',
      model: 'Wall outlet',
      category: 'power',
      groups: [{ count: 2, label: 'Socket', direction: 'out', connectors: [{ type: 'schuko', gender: F }], signal: 'power-ac' }],
    },
  },
  {
    key: 'powerStrip',
    spec: {
      manufacturer: 'Generic',
      model: 'Power strip',
      category: 'power',
      groups: [
        { count: 1, label: 'Plug', direction: 'in', connectors: [{ type: 'schuko', gender: M }], signal: 'power-ac' },
        { count: 6, label: 'Socket', direction: 'out', connectors: [{ type: 'schuko', gender: F }], signal: 'power-ac' },
      ],
    },
  },
  {
    key: 'pedalPsu',
    spec: {
      manufacturer: 'Generic',
      model: 'Pedal power supply',
      category: 'power',
      groups: [
        mainsInlet,
        { count: 8, label: 'DC Out', direction: 'out', connectors: [{ type: 'dc-barrel', gender: F }], signal: 'power-dc' },
      ],
    },
  },
  {
    key: 'dcAdapter',
    spec: {
      manufacturer: 'Generic',
      model: 'DC power adapter',
      category: 'power',
      groups: [
        { count: 1, label: 'Mains Plug', direction: 'in', connectors: [{ type: 'schuko', gender: M }], signal: 'power-ac' },
        { count: 1, label: 'DC Plug', direction: 'out', connectors: [{ type: 'dc-barrel', gender: M }], signal: 'power-dc' },
      ],
    },
  },
  {
    key: 'daisyChain',
    spec: {
      manufacturer: 'Generic',
      model: 'DC daisy chain',
      category: 'power',
      groups: [
        { count: 1, label: 'DC In', direction: 'in', connectors: [{ type: 'dc-barrel', gender: F }], signal: 'power-dc' },
        { count: 5, label: 'DC Plug', direction: 'out', connectors: [{ type: 'dc-barrel', gender: M }], signal: 'power-dc' },
      ],
    },
  },
];

/** Sensible default gender for a connector on a device panel. */
export function defaultConnector(type: Connector['type'], direction: Direction): Connector {
  // Mains: devices have male inlets, outlets/strips have female sockets.
  if (type === 'schuko' || type === 'iec' || type === 'iec-c7' || type === 'powercon') {
    return { type, gender: direction === 'in' ? 'male' : 'female' };
  }
  if (type === 'toslink' || type === 'rj45' || type === 'dsub25') return { type, gender: type === 'dsub25' ? 'female' : 'none' };
  if (type === 'xlr' || type === 'aes-xlr') return { type, gender: direction === 'out' ? 'male' : 'female' };
  return { type, gender: 'female' };
}
