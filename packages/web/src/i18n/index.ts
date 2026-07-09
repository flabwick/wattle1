import en from "./en.json";

/**
 * Every locale file, keyed by locale code. Only "en" exists today — see
 * i18n/README.md for how to add another. A flat key -> string lookup is enough for
 * this app; no plural rules, interpolation, or full i18n library.
 */
const locales = { en } as const;

export type Locale = keyof typeof locales;
export type TranslationKey = keyof typeof en;

// No locale switcher yet — fixed to "en". Kept as a variable (not inlined into t())
// so adding one later is a matter of updating this value, not every call site.
const currentLocale: Locale = "en";

export function t(key: TranslationKey): string {
  return locales[currentLocale][key] ?? key;
}

/** Mirrors the shape a fuller i18n library would offer, so call sites don't need to
 *  change if this hook grows locale-switching state later. */
export function useTranslation() {
  return { t };
}
