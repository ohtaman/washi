import enCatalog from "../locales/en.json" with { type: "json" };
import jaCatalog from "../locales/ja.json" with { type: "json" };
import zhCatalog from "../locales/zh.json" with { type: "json" };

export type Locale = "en" | "ja" | "zh";

export interface TranslationDict {
  headerSubtitle: string;
  modelSelectLabel: string;
  solverSelectLabel: string;
  resetButton: string;
  viewLpButton: string;
  runButton: string;
  tabSolution: string;
  tabLp: string;
  tabLogs: string;
  tabDocs: string;
  statusLabel: string;
  objectiveLabel: string;
  timeLabel: string;
  varsLabel: string;
  visualizationTitle: string;
  tableTitle: string;
  filterNonZeroLabel: string;
  colName: string;
  colType: string;
  colValue: string;
  colBounds: string;
  colReducedCost: string;
  // Constraints & Sensitivity table
  constrsTableTitle: string;
  constrsTableSubtitle: string;
  colConstrName: string;
  colConstrRhs: string;
  colConstrStatus: string;
  colConstrSlack: string;
  colConstrDual: string;
  // Portfolio QP visualizer
  portfolioRiskLabel: string;
  portfolioVolLabel: string;
  portfolioBudgetLabel: string;
  portfolioWeightsTitle: string;
  // Supply chain visualizer
  supplyChainOpenedWarehouses: string;
  supplyChainTotalShipped: string;
  supplyChainAvgCost: string;
  supplyChainTopWarehouses: string;
  supplyChainWarehouseUnit: string;
  // Unsat Core (Conflict Diagnosis)
  unsatCoreTitle: string;
  unsatCoreDesc: string;
  backToDocs: string;
  navShowcase: string;
  // Presets & categories
  categoryFundamentals: string;
  categoryPractical: string;
  categoryLogic: string;
  optimalSummaryTitle: string;
}

export const CATALOGS: Record<Locale, { ui: TranslationDict; presets: Record<string, { title: string; description: string }>; docsHtml: string }> = {
  en: enCatalog as any,
  ja: jaCatalog as any,
  zh: zhCatalog as any,
};

export const translations: Record<Locale, TranslationDict> = {
  en: enCatalog.ui as any,
  ja: jaCatalog.ui as any,
  zh: zhCatalog.ui as any,
};

const STORAGE_KEY = "opt_ts_locale";

export function detectInitialLocale(stored?: string | null, browserLang?: string): Locale {
  if (stored === "en" || stored === "ja" || stored === "zh") {
    return stored;
  }
  const lang = (browserLang || (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("ja")) return "ja";
  return "en";
}

let currentLocale: Locale = "en";
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore storage errors in restricted iframe
    }
  }
  listeners.forEach((fn) => fn(locale));
}

export function initLocale(): Locale {
  let stored: string | null = null;
  if (typeof localStorage !== "undefined") {
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  const initial = detectInitialLocale(stored);
  currentLocale = initial;
  return initial;
}

export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key: keyof TranslationDict): string {
  const dict = translations[currentLocale] || translations.en;
  return dict[key] || translations.en[key] || String(key);
}

export function getPresetTitle(id: string, fallbackTitle: string): string {
  const cat = CATALOGS[currentLocale] || CATALOGS.en;
  return cat.presets?.[id]?.title || fallbackTitle;
}

export function getPresetDescription(id: string, fallbackDesc: string): string {
  const cat = CATALOGS[currentLocale] || CATALOGS.en;
  return cat.presets?.[id]?.description || fallbackDesc;
}
