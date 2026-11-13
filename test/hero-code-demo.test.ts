import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  HERO_INITIAL_LOGS,
  HERO_PRESET_ID,
  buildHeroSnippetCode,
  resolveHeroLocale,
} from "../docs/.vitepress/theme/components/heroExamples.js";
import { runWashiSnippet } from "../docs/.vitepress/theme/utils/runSnippet.js";
import { useComponentTranslations } from "../docs/.vitepress/theme/locales/index.js";
import { EXAMPLES } from "../examples/web-demo/src/presets/index.js";

describe("Home Hero Clean Code Demo, Brand Lockup & Visual Showcase", () => {
  it("resolves EN, JA, and ZH locales cleanly from VitePress lang tags", () => {
    expect(resolveHeroLocale("en-US")).toBe("en");
    expect(resolveHeroLocale("ja-JP")).toBe("ja");
    expect(resolveHeroLocale("zh-CN")).toBe("zh");
    expect(resolveHeroLocale("fr")).toBe("en");
  });

  it("executes the Hero snippet via live HiGHS MIP and matches initial preview stdout across EN/JA/ZH", async () => {
    for (const locale of ["en", "ja", "zh"] as const) {
      const code = buildHeroSnippetCode(locale);
      const res = await runWashiSnippet(code);
      expect(res.errorMsg).toBeNull();
      expect(res.logs).toEqual([...HERO_INITIAL_LOGS]);
    }
  });

  it("links Open in Playground to a matching cloud_sizing preset with identical optimal solution", async () => {
    const preset = EXAMPLES.find((p) => p.id === HERO_PRESET_ID);
    expect(preset).toBeDefined();
    const res = await runWashiSnippet(preset!.code);
    expect(res.errorMsg).toBeNull();
    expect(res.logs).toEqual([...HERO_INITIAL_LOGS]);
  });

  it("captures snippet logs lexically without mutating global console and surfaces runtime errors cleanly", async () => {
    const originalLog = console.log;
    const errRes = await runWashiSnippet(`
      console.log("before failure");
      throw new Error("boom");
    `);
    expect(console.log).toBe(originalLog);
    expect(errRes.logs).toEqual(["before failure"]);
    expect(errRes.errorMsg).toBe("boom");
  });

  it("defers WASM loading until click and provides clean EN/JA/ZH translations", () => {
    const vueSrc = fs.readFileSync(
      path.resolve(process.cwd(), "docs/.vitepress/theme/components/HeroCodeDemo.vue"),
      "utf-8"
    );
    expect(vueSrc).not.toContain("onMounted");
    expect(vueSrc).not.toContain('type="range"');

    for (const locale of ["en", "ja", "zh"] as const) {
      const { dict } = useComponentTranslations(locale);
      expect(dict.heroDemo.caption.length).toBeGreaterThan(0);
      expect(dict.heroDemo.badge.length).toBeGreaterThan(0);
      expect(dict.heroDemo.idleHint.length).toBeGreaterThan(0);
      expect(dict.heroDemo.previewTag.length).toBeGreaterThan(0);
      expect(dict.heroDemo.liveTag.length).toBeGreaterThan(0);
    }
  });

  it("renders visual showcase cards below features and replaces static hero emblem across EN/JA/ZH homepages", () => {
    for (const homeFile of ["docs/index.md", "docs/ja/index.md", "docs/zh/index.md"]) {
      const content = fs.readFileSync(path.resolve(process.cwd(), homeFile), "utf-8");
      expect(content).not.toContain("washi-logo.svg");
      expect(content).not.toContain("brand-hi");
      expect(content).toContain("washi-home-showcase");
      expect(content).not.toContain("/showcase/thumb-ai-shift.png");
      expect(content).toContain("/showcase/thumb-ai-timetable.png");
      expect(content).toContain("/showcase/thumb-titan-pack.png");
      expect(content).toContain("/showcase/thumb-mofumofu-sheep.png");
    }
  });
});
