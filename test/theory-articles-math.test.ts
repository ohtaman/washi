import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import katex from "katex";

describe("Web Demo Showcase: Theory Articles TeX Mathematical Formulas", () => {
  const theoryFiles = [
    "examples/web-demo/games/demon-castle-shift-theory/index.html",
    "examples/web-demo/games/mofumofu-sheep-theory/index.html",
    "examples/web-demo/games/titan-pack-theory/index.html",
    "examples/web-demo/apps/ai-timetable-theory/index.html",
  ];

  it("verifies all theory articles exist and import renderMath from katex-init.ts", () => {
    for (const relPath of theoryFiles) {
      const fullPath = path.resolve(relPath);
      expect(fs.existsSync(fullPath), `File should exist: ${relPath}`).toBe(true);

      const content = fs.readFileSync(fullPath, "utf8");
      expect(content).toContain("katex-init.ts");
      expect(content).toContain("renderMath");
    }
  });

  it("parses all display and inline math in HTML articles without any KaTeX parse errors", () => {
    for (const relPath of theoryFiles) {
      const fullPath = path.resolve(relPath);
      let content = fs.readFileSync(fullPath, "utf8");

      // Strip elements that KaTeX auto-render ignores by default
      content = content.replace(/<(pre|code|script|style)[\s\S]*?<\/\1>/gi, "");

      // Display math: $$ ... $$
      const displayMatches = [...content.matchAll(/\$\$([\s\S]*?)\$\$/g)];
      expect(displayMatches.length, `Expected display math blocks in ${relPath}`).toBeGreaterThan(0);

      for (const match of displayMatches) {
        const tex = match[1]
          .trim()
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");

        expect(() => {
          katex.renderToString(tex, { displayMode: true, throwOnError: true });
        }, `Failed to parse display math in ${relPath}:\n${tex}`).not.toThrow();
      }

      // Inline math: $ ... $
      const inlineMatches = [...content.matchAll(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g)];
      expect(inlineMatches.length, `Expected inline math formulas in ${relPath}`).toBeGreaterThan(0);

      for (const match of inlineMatches) {
        const tex = match[1]
          .trim()
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");

        expect(() => {
          katex.renderToString(tex, { displayMode: false, throwOnError: true });
        }, `Failed to parse inline math in ${relPath}:\n${tex}`).not.toThrow();
      }
    }
  });

  it("parses dynamic math strings in titan-pack-theory TEXTS without KaTeX parse errors", () => {
    const localesDir = path.resolve("examples/web-demo/games/titan-pack-theory/locales");
    const TEXTS: Record<string, Record<string, string>> = {
      en: JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")),
      ja: JSON.parse(fs.readFileSync(path.join(localesDir, "ja.json"), "utf8")),
      zh: JSON.parse(fs.readFileSync(path.join(localesDir, "zh.json"), "utf8")),
    };
    for (const [lang, obj] of Object.entries<Record<string, string>>(TEXTS)) {
      for (const [key, val] of Object.entries(obj)) {
        const matches = [...val.matchAll(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g)];
        for (const match of matches) {
          const tex = match[1]
            .trim()
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");

          expect(() => {
            katex.renderToString(tex, { displayMode: false, throwOnError: true });
          }, `Failed to parse inline math in TEXTS.${lang}.${key}:\n${tex}`).not.toThrow();
        }
      }
    }
  });
});
