import type { Locale } from "../types.js";

const GUIDE_LOADERS: Record<Locale, () => Promise<string>> = {
  en: () => import("./locales/en.md?raw").then((m) => m.default),
  ja: () => import("./locales/ja.md?raw").then((m) => m.default),
  zh: () => import("./locales/zh.md?raw").then((m) => m.default),
};

const guideCache = new Map<Locale, Promise<string>>();

export function loadGuideMarkdown(locale: Locale): Promise<string> {
  let pending = guideCache.get(locale);
  if (!pending) {
    pending = GUIDE_LOADERS[locale]().catch((err) => {
      guideCache.delete(locale);
      throw err;
    });
    guideCache.set(locale, pending);
  }
  return pending;
}
