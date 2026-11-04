/**
 * Core i18n types for WaSHI Web Demo & Showcase apps
 */

export type Locale = "en" | "ja" | "zh";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "ja", "zh"] as const;

export const DEFAULT_LOCALE: Locale = "en";

export const UNIFIED_LOCALE_STORAGE_KEY = "washi_locale";

export const LEGACY_STORAGE_KEYS: readonly string[] = [
  "washi_games_lang",
  "opt_ts_locale",
] as const;

export interface NativeLangButtonMeta {
  readonly locale: Locale;
  readonly nativeLabel: string;
  readonly htmlLang: string;
}

export const NATIVE_LANG_BUTTONS: readonly NativeLangButtonMeta[] = [
  { locale: "en", nativeLabel: "English", htmlLang: "en" },
  { locale: "ja", nativeLabel: "日本語", htmlLang: "ja" },
  { locale: "zh", nativeLabel: "中文", htmlLang: "zh-CN" },
] as const;
