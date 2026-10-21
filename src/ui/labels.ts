import type { Connector, SignalType } from '../core/model';
import type { Issue, Severity } from '../core/validation';
import { t } from '../i18n';

/** Signal colors. Always shown together with a text badge, never color alone. */
export const SIGNAL_COLORS: Record<SignalType, string> = {
  mic: '#e5534b',
  'line-bal': '#4f9cf9',
  'line-unbal': '#8fc8ff',
  instrument: '#f0a020',
  speaker: '#ff4fa3',
  headphone: '#b07cff',
  'digital-audio': '#2fbf71',
  midi: '#e0c341',
  clock: '#9aa4b2',
  data: '#34c3c3',
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
