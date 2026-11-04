import { getLocale, type Locale } from "./i18n.js";
import enCatalog from "../locales/en.json" with { type: "json" };
import jaCatalog from "../locales/ja.json" with { type: "json" };
import zhCatalog from "../locales/zh.json" with { type: "json" };

const DOCS_BY_LOCALE: Record<Locale, string> = {
  en: enCatalog.docsHtml,
  ja: jaCatalog.docsHtml,
  zh: zhCatalog.docsHtml,
};

export const DOCS_HTML = enCatalog.docsHtml;

export function getDocsHtml(locale: Locale = getLocale()): string {
  return DOCS_BY_LOCALE[locale] ?? DOCS_BY_LOCALE.en;
}
