/**
 * Core data model. Pure types, no UI dependencies.
 *
 * Everything in a project file is described here. When the shape changes in an
 * incompatible way, bump SCHEMA_VERSION and add a migration in project.ts.
 */

export const SCHEMA_VERSION = 1;

export type Direction = 'in' | 'out' | 'bidi';

export const CONNECTOR_TYPES = [
  'xlr',
  'trs-6.3',
  'ts-6.3',
  'trs-3.5',
  'ts-3.5',
  'rca',
  'speakon',
  'banana',
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
  'speaker',
  'headphone',
  'digital-audio',
  'midi',
  'clock',
  'data',
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

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
  'computer',
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
  lengthM?: number;
  color?: string;
  note?: string;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  /** Templates are embedded so a project file is self-contained. */
  templates: Record<string, DeviceTemplate>;
  devices: DeviceInstance[];
  cables: Cable[];
  nextCableNumber: number;
}
