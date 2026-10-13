import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initTheme,
  setTheme,
  applyTheme,
  toggleTheme,
  getPreferredTheme,
  getStoredThemePreference,
  VITEPRESS_THEME_KEY,
  LEGACY_THEME_KEY,
} from "../examples/web-demo/src/ui/theme.js";

class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

class MockElement {
  private attrs = new Map<string, string>();
  public innerHTML = "";
  public title = "";
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  addEventListener = vi.fn();
}

describe("Theme Management & Synchronization", () => {
  let mockStorage: MockStorage;
  let mockHtmlElement: MockElement;
  let mockButtons: MockElement[];
  let mediaQueryListeners: Array<(e: any) => void>;
  let windowEventListeners: Map<string, Array<(e: any) => void>>;
  let mockPrefersDark: boolean;

  beforeEach(() => {
    mockStorage = new MockStorage();
    mockHtmlElement = new MockElement();
    mockButtons = [new MockElement()];
    mediaQueryListeners = [];
    windowEventListeners = new Map();
    mockPrefersDark = false;

    const mockDocument = {
      documentElement: mockHtmlElement,
      querySelectorAll: (selector: string) => {
        if (selector === ".theme-toggle-btn") return mockButtons;
        return [];
      },
    };

    const mockWindow = {
      location: new URL("https://example.com/washi/demo/"),
      localStorage: mockStorage,
      matchMedia: (query: string) => ({
        matches: mockPrefersDark,
        media: query,
        addEventListener: (event: string, cb: (e: any) => void) => {
          if (event === "change") mediaQueryListeners.push(cb);
        },
        removeEventListener: vi.fn(),
      }),
      addEventListener: (event: string, cb: (e: any) => void) => {
        const list = windowEventListeners.get(event) ?? [];
        list.push(cb);
        windowEventListeners.set(event, list);
      },
      dispatchEvent: (e: any) => {
        const list = windowEventListeners.get(e.type) ?? [];
        for (const cb of list) cb(e);
        return true;
      },
    };

    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("localStorage", mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not write to localStorage on initTheme when no preference is saved (preserves auto mode)", () => {
    mockPrefersDark = false;
    initTheme();

    expect(mockHtmlElement.getAttribute("data-theme")).toBe("light");
    expect(mockStorage.getItem(VITEPRESS_THEME_KEY)).toBeNull();
    expect(mockStorage.getItem(LEGACY_THEME_KEY)).toBeNull();
  });

  it("updates theme dynamically on OS change when in automatic mode (empty localStorage)", () => {
    mockPrefersDark = false;
    initTheme();
    expect(mockHtmlElement.getAttribute("data-theme")).toBe("light");

    // Simulate OS switching to dark
    mockPrefersDark = true;
    for (const listener of mediaQueryListeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    expect(mockHtmlElement.getAttribute("data-theme")).toBe("dark");
    // Ensure automatic mode did not persist to localStorage
    expect(mockStorage.getItem(VITEPRESS_THEME_KEY)).toBeNull();
  });

  it("does not override manual theme preference when OS theme changes", () => {
    // User explicitly chose light
    setTheme("light");
    expect(mockStorage.getItem(VITEPRESS_THEME_KEY)).toBe("light");

    initTheme();

    // Simulate OS switching to dark
    mockPrefersDark = true;
    for (const listener of mediaQueryListeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    // Must remain light because user explicitly opted in
    expect(mockHtmlElement.getAttribute("data-theme")).toBe("light");
  });

  it("prioritizes vitepress-theme-appearance over legacy washi-theme key", () => {
    // If docs set dark, but legacy washi-theme was light
    mockStorage.setItem(VITEPRESS_THEME_KEY, "dark");
    mockStorage.setItem(LEGACY_THEME_KEY, "light");

    expect(getStoredThemePreference()).toBe("dark");
    expect(getPreferredTheme()).toBe("dark");
  });

  it("removes legacy washi-theme key when user explicitly sets or toggles theme", () => {
    mockStorage.setItem(LEGACY_THEME_KEY, "light");

    toggleTheme(); // switches to dark and persists

    expect(mockStorage.getItem(VITEPRESS_THEME_KEY)).toBe("dark");
    expect(mockStorage.getItem(LEGACY_THEME_KEY)).toBeNull();
  });

  it("synchronizes theme across tabs/windows via storage event", () => {
    initTheme();
    expect(mockHtmlElement.getAttribute("data-theme")).toBe("light");

    // Another tab (e.g. VitePress docs) updates appearance to dark
    mockStorage.setItem(VITEPRESS_THEME_KEY, "dark");
    const listeners = windowEventListeners.get("storage") ?? [];
    for (const cb of listeners) {
      cb({ key: VITEPRESS_THEME_KEY });
    }

    expect(mockHtmlElement.getAttribute("data-theme")).toBe("dark");
  });

  it("honors URL ?theme= query parameter without saving to storage", () => {
    (window as any).location = new URL("https://example.com/washi/demo/?theme=dark");
    expect(getPreferredTheme()).toBe("dark");

    applyTheme(getPreferredTheme());
    expect(mockHtmlElement.getAttribute("data-theme")).toBe("dark");
    expect(mockStorage.getItem(VITEPRESS_THEME_KEY)).toBeNull();
  });
});
