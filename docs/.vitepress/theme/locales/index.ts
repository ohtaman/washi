import en from "./components.en.json" with { type: "json" };
import ja from "./components.ja.json" with { type: "json" };
import zh from "./components.zh.json" with { type: "json" };

export type ComponentLocale = "en" | "ja" | "zh";

export function resolveDocLang(langStr: string): ComponentLocale {
  if (langStr.startsWith("ja")) return "ja";
  if (langStr.startsWith("zh")) return "zh";
  return "en";
}

export function useComponentTranslations(langStr: string) {
  const loc = resolveDocLang(langStr);
  const dict = loc === "ja" ? ja : loc === "zh" ? zh : en;
  return { loc, dict };
}

export { en, ja, zh };
