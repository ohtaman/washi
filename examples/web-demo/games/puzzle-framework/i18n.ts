import type { GameLang } from "../i18n.js";
import enCatalog from "./locales/en.json";
import jaCatalog from "./locales/ja.json";
import zhCatalog from "./locales/zh.json";

export type FrameworkTranslationKey = keyof typeof enCatalog;

const CATALOGS: Record<GameLang, Record<string, string>> = {
  en: enCatalog,
  ja: jaCatalog,
  zh: zhCatalog,
};

export function t(
  key: FrameworkTranslationKey,
  lang: GameLang,
  params?: Record<string, string | number>
): string {
  const catalog = CATALOGS[lang] || CATALOGS.en;
  let text = catalog[key] || CATALOGS.en[key] || String(key);
  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal));
    }
  }
  return text;
}
