/**
 * Lightweight runtime i18n module for the Hospital Nurse Scheduling AI Copilot demo
 */
import {
  DEFAULT_LOCALE,
  NATIVE_LANG_BUTTONS,
  persistLocale,
  resolveCurrentLocale,
  type Locale,
} from "../../src/i18n/index.js";

import enCatalog from "./locales/en.json" with { type: "json" };
import jaCatalog from "./locales/ja.json" with { type: "json" };
import zhCatalog from "./locales/zh.json" with { type: "json" };

import {
  SHIFT_META,
  type BuiltInShiftCode,
  type CustomShiftDef,
  type ShiftAliasDef,
  type ShiftCode,
  type ShiftMetaInfo,
} from "./types.js";

export { DEFAULT_LOCALE, NATIVE_LANG_BUTTONS, persistLocale, resolveCurrentLocale, type Locale };

export type ShiftCatalog = typeof enCatalog;

export const SHIFT_CATALOGS: Record<Locale, ShiftCatalog> = {
  en: enCatalog,
  ja: jaCatalog,
  zh: zhCatalog,
};

export function getShiftCatalog(locale: Locale = resolveCurrentLocale()): ShiftCatalog {
  return SHIFT_CATALOGS[locale] ?? SHIFT_CATALOGS.en;
}

export const WEEKDAY_SHORT_I18N: Record<Locale, readonly string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"],
  zh: ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"],
};

export function getLocalizedShiftMeta(
  code: ShiftCode,
  locale: Locale = resolveCurrentLocale(),
  customShiftDefs?: readonly CustomShiftDef[],
  shiftAliases?: readonly ShiftAliasDef[]
): ShiftMetaInfo {
  const cat = getShiftCatalog(locale);
  if (code in cat.shifts) {
    const rawMeta = SHIFT_META[code as BuiltInShiftCode];
    const localized = cat.shifts[code as keyof typeof cat.shifts];
    return {
      code,
      label: localized.label,
      shortLabel: localized.shortLabel,
      timeRange: localized.timeRange,
      colorClass: rawMeta?.colorClass || `shift-${code}`,
      colorKey: rawMeta?.colorKey || code,
    };
  }

  // Check custom shifts
  const found = customShiftDefs?.find((c) => c.code === code);
  if (found) {
    return {
      code: found.code,
      label: `${found.label} (${found.shortLabel})`,
      shortLabel: found.shortLabel,
      timeRange: found.timeRange,
      colorClass: found.colorClass || "shift-custom",
      colorKey: "custom",
    };
  }

  // Check aliases
  const foundAlias = shiftAliases?.find((a) => a.code === code);
  if (foundAlias) {
    return {
      code: foundAlias.code,
      label: `${foundAlias.label} (${foundAlias.shortLabel})`,
      shortLabel: foundAlias.shortLabel,
      timeRange: foundAlias.timeRange || foundAlias.shifts.join("/"),
      colorClass: foundAlias.colorClass || "shift-D",
      colorKey: foundAlias.code,
    };
  }

  return {
    code,
    label: code,
    shortLabel: code.slice(0, 2),
    timeRange: "09:00–17:00",
    colorClass: "shift-custom",
    colorKey: "custom",
  };
}

export function getLocalizedNurseName(
  nurseId: string,
  fallbackName: string,
  locale: Locale = resolveCurrentLocale()
): string {
  // Only localize names that belong to the authored sample roster.
  // Preserve user-provided custom names or CSV imported names.
  const isSampleNurse =
    enCatalog.nurses[nurseId as keyof typeof enCatalog.nurses]?.name === fallbackName ||
    jaCatalog.nurses[nurseId as keyof typeof jaCatalog.nurses]?.name === fallbackName ||
    zhCatalog.nurses[nurseId as keyof typeof zhCatalog.nurses]?.name === fallbackName ||
    jaCatalog.nurses[nurseId as keyof typeof jaCatalog.nurses]?.kana === fallbackName ||
    enCatalog.nurses[nurseId as keyof typeof enCatalog.nurses]?.kana === fallbackName;

  if (!isSampleNurse) {
    return fallbackName;
  }

  const cat = getShiftCatalog(locale);
  const info = cat.nurses[nurseId as keyof typeof cat.nurses];
  return info?.name || fallbackName;
}
