import type { Connector, SignalType } from '../core/model';
import type { Issue, Severity } from '../core/validation';
import { t } from '../i18n';

/** Signal colors. Always shown together with a text badge, never color alone. */
export const SIGNAL_COLORS: Record<SignalType, string> = {
  mic: '#ff7a6b',
  'line-bal': '#6aa8ff',
  'line-unbal': '#a7cbff',
  instrument: '#ffb547',
  speaker: '#ff5fa2',
  headphone: '#c39bff',
  'digital-audio': '#4fd1a5',
  midi: '#e6c84a',
  clock: '#9aa6b8',
  data: '#3fd0c9',
};

export const SEVERITY_ICONS: Record<Severity, string> = { error: '⛔', warning: '⚠️', info: 'ℹ️' };

export function connectorText(c: Connector): string {
  const gender = t(`gender.${c.gender}`);
  return gender ? `${t(`connector.${c.type}`)} ${gender}` : t(`connector.${c.type}`);
}

export function connectorsText(connectors: Connector[]): string {
  return connectors.map(connectorText).join(' / ');
}

export function issueText(issue: Issue): string {
  const params = { ...issue.params };
  // Translate enum values inside parameters.
  for (const key of ['a', 'b'] as const) {
    const v = params[key];
    if (typeof v !== 'string') continue;
    if (issue.code === 'incompatibleSignal') params[key] = t(`signal.${v as SignalType}`);
    if (issue.code === 'connectorMismatch') params[key] = t(`connector.${v as Connector['type']}`);
  }
  if (typeof params.direction === 'string') {
    params.direction = t(`direction.${params.direction as 'in' | 'out'}`).toLowerCase();
  }
  return t(`issue.${issue.code}`, params);
}

export const CABLE_COLORS = ['', 'black', 'grey', 'white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];
