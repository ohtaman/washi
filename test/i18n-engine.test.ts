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
});
