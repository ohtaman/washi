export type GameLang = "ja" | "en" | "zh";

export const GAME_LANG_STORAGE_KEY = "washi_games_lang";

export function getGameLang(): GameLang {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("lang");
      if (q === "ja" || q === "en" || q === "zh") {
        return q;
      }
    } catch {
      // Ignore URL parsing errors
    }
    try {
      const saved = window.localStorage.getItem(GAME_LANG_STORAGE_KEY);
      if (saved === "ja" || saved === "en" || saved === "zh") {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    try {
      const navLang = (window.navigator?.language || "").toLowerCase();
      if (navLang.startsWith("zh")) {
        return "zh";
      }
      if (navLang.startsWith("ja")) {
        return "ja";
      }
      if (navLang.startsWith("en")) {
        return "en";
      }
    } catch {
      // Ignore navigator errors
    }
  }
  return "ja";
}

export function setGameLang(lang: GameLang): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(GAME_LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }
}

export function pickLang<T>(lang: GameLang, map: { ja: T; en: T; zh: T }): T {
  return map[lang] ?? map.ja;
}
