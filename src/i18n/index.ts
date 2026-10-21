import { en, type MessageKey } from './en';

/**
 * Minimal i18n: one dictionary per language, `{name}` placeholders.
 * Adding a language = adding a file shaped like en.ts and registering it here.
 */
const dictionaries: Record<string, Partial<Record<MessageKey, string>>> = { en };
const current = dictionaries.en;

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text: string = current[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export type { MessageKey };
