import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
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
});
