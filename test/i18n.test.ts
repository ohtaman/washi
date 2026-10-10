import { describe, it, expect, beforeEach } from "vitest";
import {
  t,
  getLocale,
  setLocale,
  detectInitialLocale,
  type Locale,
  translations,
} from "../examples/web-demo/src/ui/i18n.js";

describe("i18n Internationalization System", () => {
  beforeEach(() => {
    // Reset to default
    setLocale("en");
  });

  it("defaults to English translation", () => {
    expect(getLocale()).toBe("en");
    expect(t("modelSelectLabel")).toBe("Problem Model:");
    expect(t("runButton")).toBe("Run Optimization");
    expect(t("statusLabel")).toBe("Status");
    expect(t("objectiveLabel")).toBe("Objective Value");
  });

  it("switches to Japanese and returns Japanese translations", () => {
    setLocale("ja");
    expect(getLocale()).toBe("ja");
    expect(t("modelSelectLabel")).toBe("問題モデル:");
    expect(t("runButton")).toBe("最適化を実行");
    expect(t("statusLabel")).toBe("求解ステータス");
    expect(t("objectiveLabel")).toBe("最適目的関数値");
  });

  it("detects Japanese when navigator.language starts with ja", () => {
    const locale = detectInitialLocale(undefined, "ja-JP");
    expect(locale).toBe("ja");
  });

  it("detects English when navigator.language is not ja", () => {
    const locale1 = detectInitialLocale(undefined, "en-US");
    expect(locale1).toBe("en");

    const locale2 = detectInitialLocale(undefined, "fr-FR");
    expect(locale2).toBe("en");
  });

  it("honors stored localStorage preference over browser language", () => {
    const locale = detectInitialLocale("en", "ja-JP");
    expect(locale).toBe("en");

    const localeJa = detectInitialLocale("ja", "en-US");
    expect(localeJa).toBe("ja");
  });

  it("has matching keys across en and ja translations", () => {
    const enKeys = Object.keys(translations.en).sort();
    const jaKeys = Object.keys(translations.ja).sort();
    expect(enKeys).toEqual(jaKeys);
  });
});
