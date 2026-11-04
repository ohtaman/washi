export type GameLang = "en" | "ja" | "zh";

export const GAME_LANG_STORAGE_KEY = "washi_games_lang";
export const GLOBAL_LANG_STORAGE_KEY = "washi_locale";

export function getGameLang(): GameLang {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("lang");
      if (q === "en" || q === "ja" || q === "zh") {
        return q;
      }
    } catch {
      // Ignore URL parsing errors
    }
    try {
      const saved =
        window.localStorage.getItem(GLOBAL_LANG_STORAGE_KEY) ||
        window.localStorage.getItem(GAME_LANG_STORAGE_KEY);
      if (saved === "en" || saved === "ja" || saved === "zh") {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    try {
      const navLang = (window.navigator?.language || "").toLowerCase();
      if (navLang.startsWith("ja")) {
        return "ja";
      }
      if (navLang.startsWith("zh")) {
        return "zh";
      }
      if (navLang.startsWith("en")) {
        return "en";
      }
    } catch {
      // Ignore navigator errors
    }
  }
  return "en";
}

export function setGameLang(lang: GameLang): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(GLOBAL_LANG_STORAGE_KEY, lang);
      window.localStorage.setItem(GAME_LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }
}

export function pickLang<T>(lang: GameLang, map: { en: T; ja: T; zh: T }): T {
  return map[lang] ?? map.en ?? map.ja ?? map.zh;
}
