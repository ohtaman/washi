import { describe, expect, it } from "vitest";
import {
  createTranslator,
  detectBrowserLocale,
  isSupportedLocale,
  lookupTranslation,
  pickLocale,
} from "../examples/web-demo/src/i18n/index.js";

describe("AC-3: Unified i18n Engine", () => {
  it("detects browser locale prioritizing Japanese, Chinese, and English fallback", () => {
    expect(detectBrowserLocale({ languages: ["ja-JP", "en-US"] })).toBe("ja");
    expect(detectBrowserLocale({ languages: ["zh-CN", "en"] })).toBe("zh");
    expect(detectBrowserLocale({ languages: ["en-GB"] })).toBe("en");
    expect(detectBrowserLocale({ languages: ["de-DE", "fr-FR"] })).toBe("en"); // English default
    expect(detectBrowserLocale({})).toBe("en");
  });

  it("validates supported locales", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("ja")).toBe(true);
    expect(isSupportedLocale("zh")).toBe(true);
    expect(isSupportedLocale("es")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it("performs nested dot lookup and parameter interpolation", () => {
    const dict = {
      app: {
        title: "WaSHI Modeler",
        welcome: "Hello, {name}! You have {count} items.",
      },
    };

    expect(lookupTranslation(dict, "app.title")).toBe("WaSHI Modeler");
    expect(lookupTranslation(dict, "app.welcome", { name: "Alice", count: 3 })).toBe(
      "Hello, Alice! You have 3 items."
    );
    expect(lookupTranslation(dict, "app.nonexistent")).toBeUndefined();
  });

  it("translates with safe fallback to English", () => {
    const catalogs = {
      en: {
        hello: "Hello",
        onlyEn: "English Only",
      },
      ja: {
        hello: "Konnichiwa",
      },
    };

    const tJa = createTranslator(catalogs, "ja", "en");
    expect(tJa("hello")).toBe("Konnichiwa");
    expect(tJa("onlyEn")).toBe("English Only");
    expect(tJa("unknownKey")).toBe("unknownKey");
  });

  it("picks locale with fallback to default en", () => {
    const map = {
      en: "English",
      ja: "Japanese",
      zh: "Chinese",
    };
    expect(pickLocale("ja", map)).toBe("Japanese");
    expect(pickLocale("en", map)).toBe("English");
  });

  it("verifies all demo HTML files feature lang buttons strictly in EN -> JA -> ZH order", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");

    const demoHtmlFiles = [
      "examples/web-demo/apps/ai-shift/index.html",
      "examples/web-demo/apps/ai-timetable/index.html",
      "examples/web-demo/apps/ai-timetable-theory/index.html",
      "examples/web-demo/games/demon-castle-shift/index.html",
      "examples/web-demo/games/demon-castle-shift-theory/index.html",
      "examples/web-demo/games/mofumofu-sheep/index.html",
      "examples/web-demo/games/mofumofu-sheep-theory/index.html",
      "examples/web-demo/games/titan-pack/index.html",
      "examples/web-demo/games/titan-pack-theory/index.html",
      "examples/web-demo/demo/index.html",
    ];

    for (const relPath of demoHtmlFiles) {
      const fullPath = resolve(import.meta.dirname, "..", relPath);
      const html = readFileSync(fullPath, "utf-8");

      // Extract all data-lang-btn clusters
      const btnMatches = [...html.matchAll(/data-lang-btn="([^"]+)"/g)].map((m) => m[1]);
      expect(btnMatches.length, `Expected lang buttons in ${relPath}`).toBeGreaterThanOrEqual(3);

      // Verify each 3-tuple sequence is strictly ["en", "ja", "zh"]
      for (let i = 0; i < btnMatches.length; i += 3) {
        const cluster = btnMatches.slice(i, i + 3);
        expect(cluster, `Lang button sequence mismatch in ${relPath}`).toEqual(["en", "ja", "zh"]);
      }
    }
  });

  it("verifies ai-shift localized shift metadata matches language catalogs", async () => {
    const { getLocalizedShiftMeta } = await import(
      "../examples/web-demo/apps/ai-shift/i18n.js"
    );

    // Japanese: 日, 準, 深, 休
    expect(getLocalizedShiftMeta("D", "ja").shortLabel).toBe("\u65E5");
    expect(getLocalizedShiftMeta("E", "ja").shortLabel).toBe("\u6E96");
    expect(getLocalizedShiftMeta("N", "ja").shortLabel).toBe("\u6DF1");
    expect(getLocalizedShiftMeta("O", "ja").shortLabel).toBe("\u4F11");

    // English: Day, Eve, Night, Off
    expect(getLocalizedShiftMeta("D", "en").shortLabel).toBe("Day");
    expect(getLocalizedShiftMeta("E", "en").shortLabel).toBe("Eve");
    expect(getLocalizedShiftMeta("N", "en").shortLabel).toBe("Night");
    expect(getLocalizedShiftMeta("O", "en").shortLabel).toBe("Off");

    // Chinese: 白, 小, 大, 休
    expect(getLocalizedShiftMeta("D", "zh").shortLabel).toBe("\u767D");
    expect(getLocalizedShiftMeta("E", "zh").shortLabel).toBe("\u5C0F");
    expect(getLocalizedShiftMeta("N", "zh").shortLabel).toBe("\u5927");
    expect(getLocalizedShiftMeta("O", "zh").shortLabel).toBe("\u4F11");
  });

  it("preserves imported custom nurse names and only localizes authored sample names", async () => {
    const { getLocalizedNurseName } = await import(
      "../examples/web-demo/apps/ai-shift/i18n.js"
    );

    // Custom or imported names must not be overwritten
    expect(getLocalizedNurseName("N01", "Alice Example", "en")).toBe("Alice Example");
    expect(getLocalizedNurseName("N01", "Alice Example", "ja")).toBe("Alice Example");
    expect(getLocalizedNurseName("N01", "Alice Example", "zh")).toBe("Alice Example");

    // Authored sample roster names localize cleanly
    expect(getLocalizedNurseName("N01", "Misaki Sato", "ja")).toBe("\u4F50\u85E4 \u7F8E\u54B2");
    expect(getLocalizedNurseName("N01", "\u4F50\u85E4 \u7F8E\u54B2", "en")).toBe("Misaki Sato");
    expect(getLocalizedNurseName("N02", "\u9234\u6728 \u967D\u83DC", "en")).toBe("Hina Suzuki");
  });
});
