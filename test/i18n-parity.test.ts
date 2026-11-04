import { describe, expect, it } from "vitest";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

function findLocaleDirs(dir: string, result: string[] = []): string[] {
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "locales") {
        result.push(full);
      } else if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist") {
        findLocaleDirs(full, result);
      }
    }
  }
  return result;
}

function getJsonKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return [prefix];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    keys.push(...getJsonKeys(v, nextKey));
  }
  return keys;
}

describe("AC-4: Translation Catalog Key Parity", () => {
  it("enforces identical key structures between ja.json, zh.json, and en.json where present", () => {
    const rootDir = resolve(import.meta.dirname, "..");
    const localeDirs = findLocaleDirs(rootDir);

    for (const dir of localeDirs) {
      const enPath = join(dir, "en.json");
      const jaPath = join(dir, "ja.json");
      const zhPath = join(dir, "zh.json");

      if (existsSync(enPath) && existsSync(jaPath)) {
        const enData = JSON.parse(readFileSync(enPath, "utf-8"));
        const jaData = JSON.parse(readFileSync(jaPath, "utf-8"));

        const enKeys = getJsonKeys(enData).sort();
        const jaKeys = getJsonKeys(jaData).sort();

        expect(jaKeys, `Key mismatch in ${jaPath} compared to ${enPath}`).toEqual(enKeys);
      }

      if (existsSync(enPath) && existsSync(zhPath)) {
        const enData = JSON.parse(readFileSync(enPath, "utf-8"));
        const zhData = JSON.parse(readFileSync(zhPath, "utf-8"));

        const enKeys = getJsonKeys(enData).sort();
        const zhKeys = getJsonKeys(zhData).sort();

        expect(zhKeys, `Key mismatch in ${zhPath} compared to ${enPath}`).toEqual(enKeys);
      }
    }
  });
});
