/**
 * WaSHI Theme Manager
 * Supports light / dark mode switching, OS preference synchronization,
 * URL query param override (?theme=dark|light), and synchronization with VitePress docs.
 */

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "washi-theme";
const VITEPRESS_THEME_KEY = "vitepress-theme-appearance";

export function getPreferredTheme(): Theme {
  // 1. Check URL query param (?theme=dark or ?theme=light)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get("theme");
    if (themeParam === "dark" || themeParam === "light") {
      return themeParam;
    }

    // 2. Check localStorage (washi-theme or VitePress theme)
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(VITEPRESS_THEME_KEY);
      if (stored === "dark" || stored === "light") {
        return stored;
      }
    } catch (_) {}

    // 3. Fallback to system preference
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }

  return "light";
}

export function setTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem(VITEPRESS_THEME_KEY, theme);
  } catch (_) {}

  updateThemeToggleButtons(theme);
}

export function toggleTheme(): Theme {
  const current = (document.documentElement.getAttribute("data-theme") as Theme) || getPreferredTheme();
  const nextTheme: Theme = current === "dark" ? "light" : "dark";
  setTheme(nextTheme);
  return nextTheme;
}

function updateThemeToggleButtons(theme: Theme): void {
  const toggleBtns = document.querySelectorAll<HTMLButtonElement>(".theme-toggle-btn");
  toggleBtns.forEach((btn) => {
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    btn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.innerHTML = theme === "dark" ? "☀️" : "🌙";
  });
}

export function initTheme(): void {
  const initialTheme = getPreferredTheme();
  setTheme(initialTheme);

  // Attach click listener to any theme toggle buttons on the page
  const toggleBtns = document.querySelectorAll<HTMLButtonElement>(".theme-toggle-btn");
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleTheme();
    });
  });

  // Listen for OS system theme changes (if user hasn't explicitly set a preference)
  if (typeof window !== "undefined" && window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", (e) => {
      try {
        const manual = localStorage.getItem(THEME_STORAGE_KEY);
        if (!manual) {
          setTheme(e.matches ? "dark" : "light");
        }
      } catch (_) {}
    });
  }
}
