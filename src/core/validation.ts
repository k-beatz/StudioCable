import type { Cable, Port, Project, SignalType } from './model';
import { getPort } from './project';

/**
 * Connection checks. Never blocking: they only produce issues that the UI
 * shows. Messages are i18n keys plus parameters, not finished text.
 */

export type Severity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'missingPort'
  | 'sameDirection'
  | 'incompatibleSignal'
  | 'speakerIntoNonSpeaker'
  | 'lineIntoSpeaker'
  | 'lineIntoMic'
  | 'micIntoLine'
  | 'instrumentNeedsDi'
  | 'headphoneIntoLine'
  | 'balancedMismatch'
  | 'connectorMismatch'
  | 'channelMismatch'
  | 'portOccupied'
  | 'mainsIntoDc';

export interface Issue {
  cableId: string;
  severity: Severity;
  code: IssueCode;
  params?: Record<string, string | number>;
}

type SignalFamily = 'analog' | 'digital-audio' | 'midi' | 'clock' | 'data' | 'power-ac' | 'power-dc';

const FAMILY: Record<SignalType, SignalFamily> = {
  mic: 'analog',
  'line-bal': 'analog',
  'line-unbal': 'analog',
  instrument: 'analog',
  speaker: 'analog',
  headphone: 'analog',
  'digital-audio': 'digital-audio',
  midi: 'midi',
  clock: 'clock',
  data: 'data',
  'power-ac': 'power-ac',
  'power-dc': 'power-dc',
};

/** Checks one cable. `occupancy` maps "deviceId/portId" to the number of cables on it. */
export function checkCable(project: Project, cable: Cable, occupancy?: Map<string, number>): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: IssueCode, params?: Issue['params']) =>
    issues.push({ cableId: cable.id, severity, code, params });

  const [a, b] = cable.ends.map((e) => getPort(project, e));
  if (!a || !b) {
    add('error', 'missingPort');
    return issues;
  }

  if (occupancy) {
    for (const end of cable.ends) {
      if ((occupancy.get(endKey(end)) ?? 0) > 1) {
        add('warning', 'portOccupied', { port: getPort(project, end)?.label ?? '?' });
      }
    }
  }

  // Direction: figure out which side sends and which receives.
  let source: Port | undefined;
  let target: Port | undefined;
  if (a.direction === b.direction && a.direction !== 'bidi') {
    add('error', 'sameDirection', { direction: a.direction });
  } else if (a.direction === 'in' || b.direction === 'out') {
    [source, target] = [b, a];
  } else {
    [source, target] = [a, b];
  }

  if (source?.signal === 'power-ac' && target?.signal === 'power-dc') {
    add('error', 'mainsIntoDc');
  } else if (FAMILY[a.signal] !== FAMILY[b.signal]) {
    add('error', 'incompatibleSignal', { a: a.signal, b: b.signal });
  } else if (source && target && !target.alsoAccepts?.includes(source.signal)) {
    checkSignalLevels(source.signal, target.signal, add);
  }

  checkConnectors(a, b, add);

  const ca = a.channels ?? 1;
  const cb = b.channels ?? 1;
  if (ca !== cb) add('info', 'channelMismatch', { a: ca, b: cb });

  return issues;
}

function checkSignalLevels(
  src: SignalType,
  dst: SignalType,
  add: (s: Severity, c: IssueCode, p?: Issue['params']) => void,
) {
  if (src === dst) return;
  const isLine = (s: SignalType) => s === 'line-bal' || s === 'line-unbal';

  if (src === 'speaker') return add('error', 'speakerIntoNonSpeaker');
  if (dst === 'speaker') return add('warning', 'lineIntoSpeaker');
  if (dst === 'mic' && (isLine(src) || src === 'headphone')) return add('warning', 'lineIntoMic');
  if (src === 'mic' && dst !== 'mic') return add('info', 'micIntoLine');
  if (src === 'instrument' && dst !== 'instrument') return add('info', 'instrumentNeedsDi');
  if (src === 'headphone' && isLine(dst)) return add('info', 'headphoneIntoLine');
  if (isLine(src) && isLine(dst)) return add('info', 'balancedMismatch');
}

function checkConnectors(a: Port, b: Port, add: (s: Severity, c: IssueCode, p?: Issue['params']) => void) {
  const typesA = new Set(a.connectors.map((c) => c.type));
  if (b.connectors.some((c) => typesA.has(c.type))) return;
  // No common connector: a cable with different ends (or an adapter) is needed.
  add('info', 'connectorMismatch', {
    a: a.connectors[0]?.type ?? '?',
    b: b.connectors[0]?.type ?? '?',
  });
}

function endKey(end: { deviceId: string; portId: string }) {
  return `${end.deviceId}/${end.portId}`;
}

export function computeOccupancy(project: Project): Map<string, number> {
  const map = new Map<string, number>();
  for (const cable of project.cables) {
    for (const end of cable.ends) map.set(endKey(end), (map.get(endKey(end)) ?? 0) + 1);
  }
  return map;
}

export function checkProject(project: Project): Issue[] {
  const occupancy = computeOccupancy(project);
  return project.cables.flatMap((c) => checkCable(project, c, occupancy));
}

const RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

export function worstSeverity(issues: Issue[]): Severity | undefined {
  let worst: Severity | undefined;
  for (const i of issues) if (!worst || RANK[i.severity] > RANK[worst]) worst = i.severity;
  return worst;
}

