/**
 * WaSHI Theme Manager
 * Supports light / dark mode switching, OS preference synchronization,
 * URL query param override (?theme=dark|light), and synchronization with VitePress docs.
 */

export type Theme = "light" | "dark";

export const VITEPRESS_THEME_KEY = "vitepress-theme-appearance";
export const LEGACY_THEME_KEY = "washi-theme";

/**
 * Returns the explicitly stored theme preference, or null if unset/auto.
 */
export function getStoredThemePreference(): Theme | "auto" | null {
  if (typeof localStorage === "undefined") return null;
  try {
    // Prefer authoritative VitePress key first
    const vitepress = localStorage.getItem(VITEPRESS_THEME_KEY);
    if (vitepress === "dark" || vitepress === "light" || vitepress === "auto") {
      return vitepress;
    }
    // Migration fallback for legacy washi-theme key
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === "dark" || legacy === "light" || legacy === "auto") {
      return legacy;
    }
  } catch (_) {}
  return null;
}

/**
 * Resolves the effective theme based on URL query params, stored user preference,
 * and system prefers-color-scheme.
 */
export function getPreferredTheme(): Theme {
  if (typeof window !== "undefined") {
    // 1. Check URL query param (?theme=dark or ?theme=light)
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get("theme");
    if (themeParam === "dark" || themeParam === "light") {
      return themeParam;
    }

    // 2. Check stored preference in localStorage
    const stored = getStoredThemePreference();
    if (stored === "dark" || stored === "light") {
      return stored;
    }

    // 3. Fallback to system preference (for 'auto' or when no preference is saved)
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }

  return "light";
}

/**
 * Applies the theme to the DOM and UI toggle buttons without writing to localStorage.
 * Used during initialization, OS changes, and cross-tab storage sync.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", theme);
  updateThemeToggleButtons(theme);
}

/**
 * Sets the theme and persists the choice to localStorage.
 */
export function setTheme(theme: Theme | "auto", persist = true): void {
  const effectiveTheme: Theme =
    theme === "auto"
      ? (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;

  applyTheme(effectiveTheme);

  if (persist && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(VITEPRESS_THEME_KEY, theme);
      // Clean up legacy key so it never overrides or desyncs from docs
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch (_) {}
  }
}

/**
 * Toggles the current theme between dark and light, persisting the explicit preference.
 */
export function toggleTheme(): Theme {
  const current = (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") as Theme) || getPreferredTheme();
  const nextTheme: Theme = current === "dark" ? "light" : "dark";
  setTheme(nextTheme, true);
  return nextTheme;
}

function updateThemeToggleButtons(theme: Theme): void {
  if (typeof document === "undefined") return;
  const toggleBtns = document.querySelectorAll<HTMLButtonElement>(".theme-toggle-btn");
  toggleBtns.forEach((btn) => {
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    btn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.innerHTML = theme === "dark" ? "☀️" : "🌙";
  });
}

/**
 * Initializes the theme on page load.
 * NOTE: Does NOT persist system-derived theme to localStorage, preserving automatic OS updates.
 */
export function initTheme(): void {
  // Apply current preferred theme without writing to localStorage
  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);

  // Attach click listener to any theme toggle buttons on the page
  if (typeof document !== "undefined") {
    const toggleBtns = document.querySelectorAll<HTMLButtonElement>(".theme-toggle-btn");
    toggleBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleTheme();
      });
    });
  }

  // Listen for OS system theme changes (when user is in automatic mode)
  if (typeof window !== "undefined" && window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleOSChange = (e: MediaQueryListEvent | MediaQueryList) => {
      try {
        const stored = getStoredThemePreference();
        // Only react to OS changes if user hasn't explicitly set 'dark' or 'light'
        if (!stored || stored === "auto") {
          applyTheme(e.matches ? "dark" : "light");
        }
      } catch (_) {}
    };
    mediaQuery.addEventListener("change", handleOSChange);
  }

  // Synchronize theme across tabs/windows when changed in docs or other demo pages
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === VITEPRESS_THEME_KEY || e.key === LEGACY_THEME_KEY) {
        applyTheme(getPreferredTheme());
      }
    });
  }
}
