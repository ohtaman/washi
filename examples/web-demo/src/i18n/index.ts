/**
 * Lightweight, zero-dependency client-side i18n runtime for WaSHI demos and games.
 */
import {
  DEFAULT_LOCALE,
  LEGACY_STORAGE_KEYS,
  NATIVE_LANG_BUTTONS,
  SUPPORTED_LOCALES,
  UNIFIED_LOCALE_STORAGE_KEY,
  type Locale,
  type NativeLangButtonMeta,
} from "./types.js";

export * from "./types.js";

export function isSupportedLocale(val: unknown): val is Locale {
  return typeof val === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(val);
}

/**
 * Detect locale from browser navigator.languages or language string.
 */
export function detectBrowserLocale(
  nav?: { languages?: readonly string[]; language?: string }
): Locale {
  const navObj = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (!navObj) return DEFAULT_LOCALE;

  const candidates = navObj.languages?.length
    ? navObj.languages
    : navObj.language
      ? [navObj.language]
      : [];

  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    if (lower.startsWith("zh")) return "zh";
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("en")) return "en";
  }

  return DEFAULT_LOCALE;
}

/**
 * Resolve current active locale from URL, local storage, or browser settings.
 * Defaults to "en" if no preference is found.
 */
export function resolveCurrentLocale(): Locale {
  if (typeof window !== "undefined") {
    // 1. URL Query parameter ?lang=
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (isSupportedLocale(q)) return q;
    } catch {
      // Ignore URL parsing errors
    }

    // 2. Local storage (unified key, then legacy keys)
    try {
      const saved = window.localStorage.getItem(UNIFIED_LOCALE_STORAGE_KEY);
      if (isSupportedLocale(saved)) return saved;

      for (const legKey of LEGACY_STORAGE_KEYS) {
        const legVal = window.localStorage.getItem(legKey);
        if (isSupportedLocale(legVal)) return legVal;
      }
    } catch {
      // Ignore local storage errors
    }

    // 3. Browser language
    return detectBrowserLocale();
  }

  return DEFAULT_LOCALE;
}

/**
 * Persist locale to localStorage and update document.documentElement.lang
 */
export function persistLocale(locale: Locale): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(UNIFIED_LOCALE_STORAGE_KEY, locale);
      // Synchronize legacy keys to prevent mismatch during transition
      for (const legKey of LEGACY_STORAGE_KEYS) {
        window.localStorage.setItem(legKey, locale);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  if (typeof document !== "undefined" && document.documentElement) {
    const meta = NATIVE_LANG_BUTTONS.find((b) => b.locale === locale);
    document.documentElement.lang = meta ? meta.htmlLang : locale;
  }
}

/**
 * Helper to pick localized value from a simple trilingual record.
 */
export function pickLocale<T>(locale: Locale, map: Record<Locale, T>): T {
  return map[locale] ?? map[DEFAULT_LOCALE];
}

/**
 * Dot-notation lookup in a nested dictionary with parameter interpolation.
 * Example: lookup(dict, "section.title", { name: "Alice" })
 */
export function lookupTranslation(
  dict: Record<string, unknown>,
  keyPath: string,
  params?: Record<string, string | number>
): string | undefined {
  const parts = keyPath.split(".");
  let cur: unknown = dict;

  for (const part of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }

  if (typeof cur !== "string") return undefined;

  if (params) {
    return cur.replace(/\{(\w+)\}/g, (_, k: string) => {
      const val = params[k];
      return val !== undefined ? String(val) : `{${k}}`;
    });
  }

  return cur;
}

/**
 * Creates a type-safe translator bound to a catalog collection.
 */
export function createTranslator(
  catalogs: Partial<Record<Locale, Record<string, unknown>>>,
  activeLocale: Locale = resolveCurrentLocale(),
  fallbackLocale: Locale = DEFAULT_LOCALE
) {
  return function t(key: string, params?: Record<string, string | number>): string {
    const primaryDict = catalogs[activeLocale];
    if (primaryDict) {
      const res = lookupTranslation(primaryDict, key, params);
      if (res !== undefined) return res;
    }

    const fallbackDict = catalogs[fallbackLocale];
    if (fallbackDict) {
      const res = lookupTranslation(fallbackDict, key, params);
      if (res !== undefined) return res;
    }

    return key;
  };
}
