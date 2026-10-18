import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import * as Washi from "../src/index.js";
import { transpileSnippetToJs } from "../docs/.vitepress/theme/utils/transpile.js";

describe("CodeRunner documentation snippets syntax validity", () => {
  function getMarkdownFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== "node_modules" && file !== ".vitepress") {
          results = results.concat(getMarkdownFiles(fullPath));
        }
      } else if (file.endsWith(".md")) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const docsDir = path.resolve(process.cwd(), "docs");
  const mdFiles = getMarkdownFiles(docsDir);

  const snippets: { file: string; index: number; code: string }[] = [];

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const codeRunnerRegex = /<CodeRunner[\s\S]*?>([\s\S]*?)<\/CodeRunner>/g;
    let match;
    let idx = 0;
    while ((match = codeRunnerRegex.exec(content)) !== null) {
      idx++;
      const inner = match[1];
      const codeBlockMatch = inner.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        snippets.push({
          file: path.relative(process.cwd(), file),
          index: idx,
          code: codeBlockMatch[1],
        });
      }
    }
  }

  it("extracts all documentation code snippets (18 expected across EN and JA)", () => {
    expect(snippets.length).toBe(18);
  });

  for (const snippet of snippets) {
    it(`transpiles snippet #${snippet.index} in ${snippet.file} to valid JS syntax`, () => {
      const transpiled = transpileSnippetToJs(snippet.code);
      // Validating syntax by compiling with new Function
      expect(() => {
        new Function(`async function __test_snippet__() {\n${transpiled}\n}`);
      }).not.toThrow();
    });
  }

  it("verifies shipped README.md, README.ja.md, README.zh-CN.md, and docs/ contain no retired API calls, invalid options, or broken doc paths", () => {
    for (const readmeFile of ["README.md", "README.ja.md", "README.zh-CN.md"]) {
      const content = fs.readFileSync(path.resolve(process.cwd(), readmeFile), "utf-8");
      expect(content).not.toMatch(
        /\.(constrain|optimize|setObjective|vars|constrs|getValue|lessThanOrEqual|greaterThanOrEqual|equalTo)\b/
      );
      expect(content).not.toMatch(/\b(?:m|model)\.(minimize|maximize)\b/);
      expect(content).not.toContain("/public/highs.wasm");
      expect(content).not.toContain("custom-solver-guide.md");
      expect(content).not.toContain("documentation-plan.md");
    }

    for (const docFile of mdFiles) {
      const rawContent = fs.readFileSync(docFile, "utf-8");
      // Exclude the intentional Negative Examples section in ai-agents.md
      const content = rawContent.split("## 4. Negative Examples")[0];
      expect(content, `Retired API in ${docFile}`).not.toMatch(
        /\.(constrain|optimize|setObjective|vars|constrs|getValue|lessThanOrEqual|greaterThanOrEqual|equalTo)\b/
      );
      expect(content, `Retired m.minimize/maximize in ${docFile}`).not.toMatch(
        /\b(?:m|model)\.(minimize|maximize)\b/
      );
      expect(content, `Invalid computeUnsatCore option in ${docFile}`).not.toContain("computeUnsatCore");
      expect(content, `Invalid solverOptions on Model in ${docFile}`).not.toContain("solverOptions:");
      expect(rawContent, `Deleted custom-solver-guide.md ref in ${docFile}`).not.toContain("custom-solver-guide.md");

      const tsBlockRegex = /```(?:typescript|ts)\n([\s\S]*?)```/g;
      let blockMatch;
      let blockIdx = 0;
      while ((blockMatch = tsBlockRegex.exec(content)) !== null) {
        blockIdx++;
        const code = blockMatch[1];
        expect(
          () => stripTypeScriptTypes(code),
          `Invalid TypeScript syntax in ${path.relative(process.cwd(), docFile)} block #${blockIdx}`
        ).not.toThrow();
      }
    }
  });

  it("executes VitePress interactive demo components (PortfolioQpDemo, EcommerceCouponDemo, ShiftSchedulingDemo) at runtime", async () => {
    const componentsDir = path.resolve(process.cwd(), "docs/.vitepress/theme/components");
    const demoSpecs = [
      { file: "PortfolioQpDemo.vue", fn: "solvePortfolio", check: "varianceVal.value > 0" },
      { file: "EcommerceCouponDemo.vue", fn: "solveCart", check: "netPayableWithFiller.value > 0" },
      { file: "ShiftSchedulingDemo.vue", fn: "solveRoster", check: "status.value === 'Optimal'" },
    ];

    for (const spec of demoSpecs) {
      const vueSource = fs.readFileSync(path.join(componentsDir, spec.file), "utf-8");
      expect(vueSource).not.toMatch(
        /\.(constrain|optimize|setObjective|vars|constrs|getValue|lessThanOrEqual|greaterThanOrEqual|equalTo)\b/
      );
      const scriptMatch = vueSource.match(/<script setup lang="ts">([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const transpiled = stripTypeScriptTypes(scriptMatch![1]).replace(
        /^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,
        ""
      );
      const runner = new Function(
        "ref",
        "computed",
        "onMounted",
        "useData",
        "getWashiClient",
        "window",
        `return (async () => {\n${transpiled}\nawait ${spec.fn}();\nreturn Boolean(${spec.check});\n})();`
      );
      const ok = await runner(
        (v: unknown) => ({ value: v }),
        (fn: () => unknown) => ({
          get value() {
            return fn();
          },
        }),
        () => {},
        () => ({ lang: { value: "en" } }),
        async () => Washi,
        {}
      );
      expect(ok).toBe(true);
    }
  });
});
