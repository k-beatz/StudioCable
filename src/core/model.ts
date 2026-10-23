/**
 * Core data model. Pure types, no UI dependencies.
 *
 * Everything in a project file is described here. When the shape changes in an
 * incompatible way, bump SCHEMA_VERSION and add a migration in project.ts.
 */

export const SCHEMA_VERSION = 2;

export type Direction = 'in' | 'out' | 'bidi';

export const CONNECTOR_TYPES = [
  'xlr',
  'trs-6.3',
  'ts-6.3',
  'trs-3.5',
  /** 3.5 mm 4-pole jack (headset / smartphone: stereo out + mic). */
  'trrs-3.5',
  'ts-3.5',
  'rca',
  'speakon',
  'banana',
  /** Screw terminal / binding post (+/−): takes bare wire, banana plugs or spades. */
  'speaker-terminal',
  /** Spring clip terminal (+/−), typical on simple speakers: bare wire only. */
  'spring-clip',
  /** Cable end without a plug: stripped two-core speaker wire. */
  'bare-wire',
  'midi-din',
  'usb-a',
  'usb-b',
  'usb-c',
  'toslink',
  'spdif-coax',
  'aes-xlr',
  'bnc',
  'rj45',
  'dsub25',
  // Power
  'schuko',
  'iec',
  'iec-c7',
  'powercon',
  'dc-barrel',
] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export type Gender = 'male' | 'female' | 'none';

/** One physical connector. A combo jack is a port with several connectors. */
export interface Connector {
  type: ConnectorType;
  gender: Gender;
}

export const SIGNAL_TYPES = [
  'mic',
  'line-bal',
  'line-unbal',
  'instrument',
  /** Turntable (MM) cartridge: millivolts, needs RIAA equalisation in a phono stage. */
  'phono',
  'speaker',
  'headphone',
  'digital-audio',
  'midi',
  'clock',
  'data',
  // Power: shown only when the power layer is switched on.
  'power-ac',
  'power-dc',
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

/** Mains (AC) or low-voltage (DC) power rather than an audio/data signal. */
export const isPowerSignal = (s: SignalType) => s === 'power-ac' || s === 'power-dc';

export const DEVICE_CATEGORIES = [
  'interface',
  'mixer',
  'preamp',
  'outboard',
  'patchbay',
  'monitor',
  'headphones',
  'microphone',
  'instrument',
  'di-box',
  'amp',
  'pedal',
  'pedalboard',
  'computer',
  'power',
  'other',
] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

export interface Port {
  id: string;
  /** Label as printed on the device, e.g. "Input 1" or "Main Out L". */
  label: string;
  direction: Direction;
  /** At least one; several entries = combo jack (e.g. XLR/TRS). */
  connectors: Connector[];
  signal: SignalType;
  /** Inputs that also take other levels, e.g. a combo jack: mic on XLR, line/instrument on TRS. */
  alsoAccepts?: SignalType[];
  /** 1 = mono, 2 = stereo, 8 = ADAT etc. Omitted = mono. */
  channels?: number;
  /** Condenser mic output: no signal without phantom power from the input it is plugged into. */
  needsPhantom?: boolean;
}

/**
 * Internal signal path inside a device (e.g. preamp channel, DI thru,
 * patchbay normal). `breakWhenPatched` lists ports that interrupt the path
 * when a cable is plugged into them (half/full normalling).
 */
export interface InternalRoute {
  from: string;
  to: string;
  breakWhenPatched?: string[];
  /** The path only exists while every condition holds (switch positions, knob ranges). */
  when?: RouteCondition[];
}

/**
 * A knob or switch on the device. Its position is stored per device
 * (DeviceInstance.settings) and can open or close internal paths.
 */
export interface Control {
  id: string;
  /** Label as printed on the device, e.g. "GAIN 1" or "PHAN". */
  label: string;
  kind: 'knob' | 'switch';
  /** Switches: the positions, e.g. ["MONO", "STEREO"] or ["OFF", "ON"]. */
  positions?: string[];
  /** Knobs: value 0 to 10. Switches: one of `positions`. */
  default: string | number;
  /** Knobs: print at the ends of the scale, e.g. "MIN" / "MAX" or "DIRECT" / "DAW". */
  minLabel?: string;
  maxLabel?: string;
  /** Knobs: sets the level of these ports (port IDs). Turned fully down (0), nothing passes them. */
  levelOf?: string[];
  /** Phantom power switch for these inputs (port IDs): the position "ON" powers them. */
  phantomFor?: string[];
}

export const KNOB_MAX = 10;

/** `is`: switch is in one of these positions. `min` / `max`: knob value range (inclusive). */
export interface RouteCondition {
  control: string;
  is?: string[];
  min?: number;
  max?: number;
}

export interface Source {
  title?: string;
  url: string;
}

export type TemplateOrigin = 'library' | 'generic' | 'custom';

export interface DeviceTemplate {
  id: string;
  manufacturer: string;
  model: string;
  category: DeviceCategory;
  ports: Port[];
  routing?: InternalRoute[];
  /** Knobs and switches that change the internal routing. */
  controls?: Control[];
  origin: TemplateOrigin;
  /** Library devices: ID of the library entry this template was created from. */
  libraryId?: string;
  /** Where the specs come from (e.g. the manufacturer's manual). */
  sources?: Source[];
  /** Library devices: checked by a person against the real device or manual. */
  verified?: boolean;
}

export interface DeviceInstance {
  id: string;
  templateId: string;
  /** User-facing name, e.g. "Preamp left rack". */
  name: string;
  location?: string;
  position: { x: number; y: number };
  /** ID of a pedalboard (or other container device) this device sits on. */
  containerId?: string;
  /** Diagram shows only the ports that have a cable (keeps big devices small). */
  collapsed?: boolean;
  /** Top height unit in the rack (1 = top); absent if the device is not in the rack. */
  rackSlot?: number;
  /** Height in rack units (U). */
  rackHeight?: number;
  /** Positions of the template's controls by control ID; missing = the control's default. */
  settings?: Record<string, string | number>;
}

export interface CableEnd {
  deviceId: string;
  portId: string;
  /** Connector on this end of the cable, if it differs from the port default. */
  connector?: ConnectorType;
}

export interface Cable {
  id: string;
  /** Human-readable sequential ID, e.g. "C-001". Stays stable once assigned. */
  label: string;
  /** ends[0] is normally the source (output) side. */
  ends: [CableEnd, CableEnd];
  cableType?: string;
  /** Speaker cables: "swapped" = + and − crossed at one end (speaker out of phase). */
  polarity?: 'swapped';
  lengthM?: number;
  color?: string;
  note?: string;
}

/**
 * A "system": devices and cables that belong together, e.g. guitar -> pedals
 * -> amp -> mixer line in. A device that is only partly involved (the mixer)
 * is not listed; its ports are marked through the group's cables instead.
 */
export interface Group {
  id: string;
  name: string;
  color: string;
  deviceIds: string[];
  cableIds: string[];
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  /** Templates are embedded so a project file is self-contained. */
  templates: Record<string, DeviceTemplate>;
  devices: DeviceInstance[];
  cables: Cable[];
  groups: Group[];
  nextCableNumber: number;
  /** Height of the project's 19" rack in units (default 12). */
  rackUnits?: number;
}
