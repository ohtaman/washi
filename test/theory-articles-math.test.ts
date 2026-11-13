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

  it("enforces Honshu two-color textbook theme and valid CSS token references across theory articles", () => {
    const css = fs.readFileSync(path.resolve("examples/web-demo/src/theory-theme.css"), "utf8");
    expect(css).toContain("--color-bg-page: #ffffff");
    expect(css).toContain("--color-brand-primary: #c23b22");
    expect(css).toContain("--color-brand-primary-ink: #a62c16");
    expect(css).toContain("--color-brand-primary-soft: #fdf4f2");
    expect(css).not.toContain("M PLUS Rounded 1c");
    expect(css).not.toContain("border-style: dashed");

    const rootBlockMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
    expect(rootBlockMatch, "Expected :root block in theory-theme.css").not.toBeNull();
    const rootVars = new Set(
      [...(rootBlockMatch?.[1] ?? "").matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
    );
    const allDefinedVars = new Set(
      [...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
    );

    for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      expect(allDefinedVars.has(m[1]), `Undefined CSS variable ${m[1]} in theory-theme.css`).toBe(true);
    }

    const forbiddenStudyGuideTokens = [
      "Chapter 01",
      "Chapter 02",
      "Chapter 03",
      "Chapter 04",
      "Chapter 05",
      "POINT :",
      "POINT:",
      "CAUTION :",
      "CAUTION:",
      "対象読者：",
      "Target Audience:",
      "适合读者：",
    ];

    for (const relPath of theoryFiles) {
      const htmlDir = path.dirname(path.resolve(relPath));
      const html = fs.readFileSync(path.resolve(relPath), "utf8");
      expect(html).not.toContain("M+PLUS+Rounded+1c");
      expect(html).toContain('<span class="chapter-badge">01</span>');
      for (const token of forbiddenStudyGuideTokens) {
        expect(html, `${relPath} should not contain study-guide token "${token}"`).not.toContain(token);
      }
      for (const m of html.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        expect(rootVars.has(m[1]), `Undefined :root CSS variable ${m[1]} in ${relPath}`).toBe(true);
      }

      for (const lang of ["en", "ja", "zh"]) {
        const localePath = path.join(htmlDir, "locales", `${lang}.json`);
        const localeRaw = fs.readFileSync(localePath, "utf8");
        for (const token of forbiddenStudyGuideTokens) {
          expect(
            localeRaw,
            `${localePath} should not contain study-guide token "${token}"`
          ).not.toContain(token);
        }
        for (const m of localeRaw.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
          expect(rootVars.has(m[1]), `Undefined :root CSS variable ${m[1]} in ${localePath}`).toBe(true);
        }
      }
    }
  });
});
