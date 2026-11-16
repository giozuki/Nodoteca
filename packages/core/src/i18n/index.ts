import { en, type MessageKey, type Messages } from "./en.js";
import { it } from "./it.js";

export type { MessageKey, Messages };

/** Supported languages. English is the default. To add one: create `xx.ts`, register it here. */
export const LOCALES = {
  en: { label: "English", messages: en },
  it: { label: "Italiano", messages: it },
} as const satisfies Record<string, { label: string; messages: Messages }>;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(LOCALES, value);
}

/**
 * Picks the best supported locale from a list of preferences,
 * e.g. `navigator.languages` (["it-IT", "en-US"] -> "it").
 */
export function resolveLocale(preferred: readonly string[] = []): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Returns a translate function for a locale, with `{placeholder}` interpolation. */
export function createTranslator(locale: Locale) {
  const messages: Messages = LOCALES[locale].messages;
  return function t(key: MessageKey, params?: Record<string, string | number>): string {
    const template = messages[key] ?? en[key];
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}
