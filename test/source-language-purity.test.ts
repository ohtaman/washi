import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regex for Japanese Kana (Hiragana & Katakana).
 * Absolutely forbidden in all source code, HTML, CSS, and non-locale JSON/markdown.
 */
const KANA_REGEX = /[\u3040-\u309F\u30A0-\u30FF]/;

/**
 * Regex for general CJK characters (Hanzi / Kanji / CJK symbols & punctuation / Fullwidth forms).
 */
const CJK_REGEX = /[\u3000-\u303F\u4E00-\u9FAF\uFF01-\uFF60]/;

/**
 * Allowed path prefixes/files for localized content.
 * These are the ONLY files permitted to contain localized non-English text.
 */
function isAllowedLocalizedFile(filePath: string): boolean {
  // Documentation localized trees
  if (
    filePath.startsWith("docs/ja/") ||
    filePath.startsWith("docs/zh/") ||
    filePath === "README.ja.md" ||
    filePath === "README.zh-CN.md"
  ) {
    return true;
  }

  // Pure JSON translation catalogs
  if (filePath.includes("/locales/") && filePath.endsWith(".json")) {
    return true;
  }

  return false;
}

/**
 * Strict whitelist for language selector native labels (e.g., '日本語', '中文')
 * only permitted within centralized language button metadata.
 */
const ALLOWED_NATIVE_LANG_PATTERNS = [
  /日本語/,
  /中文/,
  /简体中文/,
];

function isLineWhitelistedForNativeLangButtons(line: string): boolean {
  // If line only contains whitelisted native language labels (like data-lang-btn or label definitions)
  for (const pattern of ALLOWED_NATIVE_LANG_PATTERNS) {
    if (pattern.test(line)) {
      // Strip allowed native terms and check if any remaining CJK exists
      let stripped = line.replace(/日本語/g, "").replace(/简体中文/g, "").replace(/中文/g, "");
      if (!KANA_REGEX.test(stripped) && !CJK_REGEX.test(stripped)) {
        return true;
      }
    }
  }
  return false;
}

describe("AC-1: Source Code Language Purity (English-First)", () => {
  it("enforces zero hardcoded Japanese Kana in any source file", () => {
    const rootDir = resolve(import.meta.dirname, "..");
    const trackedFiles = execSync("git ls-files --cached --others --exclude-standard", { cwd: rootDir })
      .toString("utf-8")
      .trim()
      .split("\n")
      .filter(Boolean);

    const violations: { file: string; lineNum: number; line: string }[] = [];

    for (const file of trackedFiles) {
      if (isAllowedLocalizedFile(file)) {
        continue;
      }

      // Check forbidden source extensions
      const ext = file.split(".").pop()?.toLowerCase();
      const forbiddenExts = ["ts", "tsx", "vue", "html", "css", "mjs", "js"];
      const isEnglishMd = ext === "md";
      const isNonLocaleJson = ext === "json";

      if (!forbiddenExts.includes(ext || "") && !isEnglishMd && !isNonLocaleJson) {
        continue;
      }

      const fullPath = resolve(rootDir, file);
      if (!existsSync(fullPath)) continue;

      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (KANA_REGEX.test(line)) {
          if (isLineWhitelistedForNativeLangButtons(line)) {
            continue;
          }
          violations.push({
            file,
            lineNum: i + 1,
            line: line.trim().slice(0, 100),
          });
        }
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .slice(0, 25)
        .map((v) => `  ${v.file}:${v.lineNum} -> ${v.line}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} lines containing Japanese Kana in source files!\n` +
          `Expected zero Japanese in source code (English-first architecture).\n` +
          `Sample violations:\n${summary}\n... and ${Math.max(0, violations.length - 25)} more.`
      );
    }

    expect(violations.length).toBe(0);
  });
});
