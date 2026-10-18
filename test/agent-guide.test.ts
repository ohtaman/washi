import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import * as Washi from "../src/index.js";
import "../src/modeler/solvers/glpk/index.js";
import { killZ3Threads } from "../src/modeler/solvers/z3/index.js";
import {
  buildLlmsArtifacts,
  generateLlms,
  populateSiteLlmsAssets,
  stripVitePressSyntax,
} from "../scripts/generate-llms.mjs";

describe("AI Coding Agent Quick-Reference Guide (docs/getting-started/ai-agents.md)", () => {
  const guidePath = path.resolve(process.cwd(), "docs/getting-started/ai-agents.md");
  const guideContent = fs.readFileSync(guidePath, "utf-8");

  const codeBlocks: string[] = [];
  const blockRegex = /```(?:ts|typescript)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(guideContent)) !== null) {
    codeBlocks.push(match[1]);
  }

  it("is linked from READMEs, AGENTS.md, and docs/getting-started/index.md, and shipped in package.json files", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    expect(pkg.files).toContain("docs/getting-started/ai-agents.md");

    for (const file of [
      "README.md",
      "README.ja.md",
      "README.zh-CN.md",
      "AGENTS.md",
      "docs/getting-started/index.md",
      "docs/.vitepress/config.mts",
    ]) {
      const text = fs.readFileSync(path.resolve(process.cwd(), file), "utf-8");
      expect(text).toContain("ai-agents");
    }
  });

  it("type-checks all extracted guide code blocks and verifies package export subpaths and symbols", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    const exportSubpaths = new Set(
      Object.keys(pkg.exports).map((k) =>
        k === "." ? "@ohtaman/washi" : `@ohtaman/washi/${k.replace(/^\.\//, "")}`
      )
    );

    expect(codeBlocks.length).toBe(7);

    const importBlock = codeBlocks[0];
    const namedImportsMatch = importBlock.match(/import\s*\{([\s\S]*?)\}\s*from\s*"@ohtaman\/washi"/);
    expect(namedImportsMatch).not.toBeNull();
    const importedNames = namedImportsMatch![1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(importedNames.length).toBeGreaterThan(0);
    for (const sym of importedNames) {
      expect(
        sym in Washi,
        `Expected symbol '${sym}' documented in ai-agents.md to be exported from @ohtaman/washi`
      ).toBe(true);
    }

    for (const block of codeBlocks) {
      const specifierRegex = /from\s+["'](@ohtaman\/washi[^"']*)["']|import\s+["'](@ohtaman\/washi[^"']*)["']/g;
      let specMatch: RegExpExecArray | null;
      while ((specMatch = specifierRegex.exec(block)) !== null) {
        const spec = specMatch[1] ?? specMatch[2];
        expect(exportSubpaths.has(spec)).toBe(true);
      }
    }

    // Type-check all guide snippets against src/ using tsc
    const rewriteImports = (src: string) =>
      src
        .replaceAll('"@ohtaman/washi/solvers/z3"', '"../src/modeler/solvers/z3/index.js"')
        .replaceAll('"@ohtaman/washi/solvers/glpk"', '"../src/modeler/solvers/glpk/index.js"')
        .replaceAll('"@ohtaman/washi"', '"../src/index.js"');

    const tmpBase = `.tmp-agent-guide-${process.pid}`;
    const tmpTsPath = path.resolve(process.cwd(), `test/${tmpBase}.ts`);
    const tmpTsconfigPath = path.resolve(process.cwd(), `test/${tmpBase}-tsconfig.json`);
    const combinedSource = [
      rewriteImports(codeBlocks[0]),
      `export function __step1And3() {\n${codeBlocks[1]}\n${codeBlocks[2]}\n}`,
      ...codeBlocks.slice(3).map((b) => rewriteImports(b).replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")),
    ].join("\n\n");

    try {
      fs.writeFileSync(tmpTsPath, combinedSource, "utf-8");
      fs.writeFileSync(
        tmpTsconfigPath,
        JSON.stringify({
          extends: "../tsconfig.lib.json",
          compilerOptions: {
            rootDir: "..",
            emitDeclarationOnly: false,
            noEmit: true,
          },
          include: [`${tmpBase}.ts`, "../src/index.ts", "../src/modeler/**/*"],
        }),
        "utf-8"
      );
      const tscBin = path.resolve(process.cwd(), "node_modules/.bin/tsc");
      try {
        execFileSync(tscBin, ["-p", tmpTsconfigPath, "--noEmit"], {
          cwd: process.cwd(),
          encoding: "utf-8",
        });
      } catch (err: any) {
        throw new Error(`tsc typecheck failed:\n${err.stdout || err.stderr || err.message}`);
      }
    } finally {
      fs.rmSync(tmpTsPath, { force: true });
      fs.rmSync(tmpTsconfigPath, { force: true });
    }
  });

  it("executes the Step 1 & Step 3 canonical workflow snippets without error", () => {
    const jsCode = `${stripTypeScriptTypes(`${codeBlocks[1]}\n${codeBlocks[2]}`)}\nreturn { m, vec, grid, byItem, mixed };`;
    const fn = new Function(
      "Model",
      "expr",
      "maximize",
      "minimize",
      "sum",
      "dot",
      jsCode
    );
    const res = fn(
      Washi.Model,
      Washi.expr,
      Washi.maximize,
      Washi.minimize,
      Washi.sum,
      Washi.dot
    );
    expect(Array.isArray(res.vec)).toBe(true);
    expect(res.vec).toHaveLength(4);
    expect(Array.isArray(res.grid)).toBe(true);
    expect(Array.isArray(res.grid[0])).toBe(true);
    expect(res.byItem.desk.name).toBe("desk");
    expect(Array.isArray(res.mixed.A)).toBe(true);
    expect(res.m.constraints.length).toBe(2);
  });

  it("executes Example A (MIP) and Example B (QP) from the guide and passes validateSolution()", async () => {
    const mipJs = stripTypeScriptTypes(codeBlocks[3])
      .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")
      .replace(/\bexport\s+async\s+function\b/, "async function");
    const runMip = new Function(
      "Model",
      "expr",
      "dot",
      "sum",
      "maximize",
      `${mipJs}\nreturn runMipExample();`
    );
    const mipRes = await runMip(
      Washi.Model,
      Washi.expr,
      Washi.dot,
      Washi.sum,
      Washi.maximize
    );
    expect(mipRes.status).toBe("Optimal");
    expect(mipRes.valid).toBe(true);
    expect(mipRes.maxViolation).toBeLessThanOrEqual(1e-6);
    expect(mipRes.values).toEqual({ desk: 20, chair: 10 });
    expect(mipRes.setup).toBe(1);
    expect(mipRes.objectiveValue).toBeCloseTo(1080, 6);

    const qpJs = stripTypeScriptTypes(codeBlocks[4])
      .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")
      .replace(/\bexport\s+async\s+function\b/, "async function");
    const runQp = new Function(
      "Model",
      "expr",
      "minimize",
      `${qpJs}\nreturn runQpExample();`
    );
    const qpRes = await runQp(Washi.Model, Washi.expr, Washi.minimize);
    expect(qpRes.status).toBe("Optimal");
    expect(qpRes.valid).toBe(true);
    expect(qpRes.x).toBeCloseTo(2, 5);
    expect(qpRes.y).toBeCloseTo(2, 5);
    expect(qpRes.objectiveValue).toBeCloseTo(8, 5);
  });

  it("executes Example C (Z3 feasibility & unsat core) and negative examples from the guide", async () => {
    try {
      const z3Js = stripTypeScriptTypes(codeBlocks[5])
        .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")
        .replace(/\bexport\s+async\s+function\b/, "async function");
      const runZ3 = new Function(
        "Model",
        "expr",
        "implies",
        `${z3Js}\nreturn runZ3Example();`
      );
      const z3Res = await runZ3(Washi.Model, Washi.expr, Washi.implies);
      expect(z3Res.status).toBe("Unsat");
      expect(z3Res.conflicts).toEqual(
        expect.arrayContaining(["customer_is_vip", "vip_min_discount", "campaign_cap"])
      );

      // Verify Z3 unsat core when infeasibility combines an untracked variable bound with a tracked constraint
      const boundModel = new Washi.Model("BoundConflict", { solver: "z3" });
      const bx = boundModel.continuous("bx", { lb: 10 });
      boundModel.constraint(Washi.expr`${bx} <= 5`, "cap_bx");
      const boundRes = await boundModel.check();
      expect(boundRes.status).toBe("Unsat");
      expect(boundRes.conflicts).toEqual(["cap_bx"]);
    } finally {
      await killZ3Threads();
    }

    const negJs = stripTypeScriptTypes(codeBlocks[6])
      .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")
      .replace(/\bexport\s+function\b/, "function");
    const runNeg = new Function(
      "Model",
      "expr",
      "maximize",
      `${negJs}\nreturn verifyNegativePatterns();`
    );
    const { m, x, y, maximize } = runNeg(Washi.Model, Washi.expr, Washi.maximize);
    expect(() => m.objective(maximize(Washi.expr`${x} <= 10` as any))).toThrow(
      /Cannot use a Constraint as an objective/
    );
    expect(() => Washi.expr`${x} + 1`.add(Washi.expr`${y} <= 5` as any)).toThrow(
      /Cannot perform arithmetic on a Constraint/
    );
    expect(() => m.constraint(Washi.expr`${x} + ${y}` as any)).toThrow(
      /Constraint must contain a comparison operator/
    );
    expect(() => Washi.expr`${x}^2 <= 10`).toThrow(
      /Quadratic constraints are not supported/
    );

    // Verify documented m.check() LP fallback on a purely linear model with default HiGHS
    const linearCheckModel = new Washi.Model("LinearCheckFallback");
    const lx = linearCheckModel.continuous("lx", { lb: 0, ub: 10 });
    linearCheckModel.constraint(Washi.expr`${lx} >= 4`, "min_lx");
    const linearCheckRes = await linearCheckModel.check();
    expect(linearCheckRes.status).toBe("Sat");
    expect(Number(linearCheckRes.values.lx)).toBeGreaterThanOrEqual(4);
    expect(linearCheckRes.conflicts).toBeUndefined();
    expect(linearCheckRes.unsatCore).toBeUndefined();
  });

  it("does not advertise nonexistent APIs or types in guide prose or comments", () => {
    expect(guideContent).not.toContain("subjectTo");
    expect(guideContent).not.toContain("m.getValue(");
    expect(guideContent).not.toContain(".iff(");
    expect(guideContent).not.toContain("ModelStatus");
    expect(guideContent).not.toContain("TypedArray");
    expect(guideContent).not.toMatch(/\bm\.(maximize|minimize)\s*=/);
    expect(guideContent).not.toMatch(/`dot\(a,\s*b\)`[^\n]*`Iterable`/);
    expect(guideContent).toContain("SolverStatus");
    expect(guideContent).toContain("isSecureContext");
    expect(guideContent).toContain("Access-Control-Allow-Origin");
    expect(guideContent).toContain("conflicts?:");
    expect(guideContent).toContain("unsatCore?:");

    const solverStatusLine = guideContent
      .split("\n")
      .find((line) => line.includes("Returns `SolverStatus`"));
    expect(solverStatusLine).toBeDefined();
    for (const status of [
      "Optimal",
      "Feasible",
      "Infeasible",
      "Unbounded",
      "TimeLimit",
      "IterationLimit",
      "Error",
      "Unknown",
      "NotSolved",
      "Sat",
      "Unsat",
    ]) {
      expect(solverStatusLine).toContain(`"${status}"`);
    }

    // Every `m.<member>` referenced in the positive guide sections must exist on a Model instance
    const positiveGuide = guideContent.split("## 4. Negative Examples")[0];
    const sampleModel = new Washi.Model("MemberCheck");
    const memberRegex = /\bm\.([a-zA-Z_]\w*)/g;
    let memberMatch: RegExpExecArray | null;
    while ((memberMatch = memberRegex.exec(positiveGuide)) !== null) {
      const member = memberMatch[1];
      expect(
        member in sampleModel,
        `Expected 'm.${member}' referenced in positive guide sections to exist on Model`
      ).toBe(true);
    }
  });
});

describe("llms.txt, llms-full.txt, and raw Markdown endpoints", () => {
  const rootDir = process.cwd();
  const docsDir = path.resolve(rootDir, "docs");
  const guidePath = path.resolve(docsDir, "getting-started/ai-agents.md");
  const guideContent = fs.readFileSync(guidePath, "utf-8");

  it("deterministically generates llms.txt and llms-full.txt and ships llms.txt in package.json files", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "package.json"), "utf-8")
    );
    expect(pkg.files).toContain("llms.txt");
    expect(pkg.scripts["docs:build"]).toContain("scripts/generate-llms.mjs");
    expect(pkg.scripts.prepublishOnly).toMatch(/build:llms|generate-llms\.mjs/);

    const run1 = generateLlms(rootDir);
    const run2 = buildLlmsArtifacts(rootDir);

    expect(run1.llmsTxt).toBe(run2.llmsTxt);
    expect(run1.llmsFullTxt).toBe(run2.llmsFullTxt);
    expect(fs.readFileSync(path.resolve(rootDir, "llms.txt"), "utf-8")).toBe(run1.llmsTxt);
    expect(fs.readFileSync(path.resolve(rootDir, "llms-full.txt"), "utf-8")).toBe(
      run1.llmsFullTxt
    );
  });

  it("verifies every relative doc path in llms.txt corresponds to an existing English documentation source file", () => {
    const { llmsTxt, allDocFiles } = buildLlmsArtifacts(rootDir);

    // Extract all Markdown link targets ending in .md
    const linkTargetRegex = /\]\(([^)]+\.md)\)/g;
    const linkedDocPaths: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkTargetRegex.exec(llmsTxt)) !== null) {
      const target = match[1];
      if (!/^https?:\/\//.test(target)) {
        linkedDocPaths.push(target);
      }
    }

    expect(linkedDocPaths.length).toBeGreaterThanOrEqual(24);

    for (const relPath of linkedDocPaths) {
      const sourcePath = path.resolve(docsDir, relPath);
      expect(
        fs.existsSync(sourcePath),
        `Expected relative doc path '${relPath}' in llms.txt to exist at ${sourcePath}`
      ).toBe(true);
    }

    // Also verify any relative `<dir>/<file>.md` token anywhere in llms.txt resolves under docs/
    const relPathTokenRegex = /\b((?:getting-started|guide|solvers|examples)\/[a-z0-9-]+\.md)\b/g;
    const tokenPaths = new Set<string>();
    while ((match = relPathTokenRegex.exec(llmsTxt)) !== null) {
      tokenPaths.add(match[1]);
    }
    expect(tokenPaths.size).toBe(allDocFiles.length);
    for (const relPath of allDocFiles) {
      expect(tokenPaths.has(relPath)).toBe(true);
      expect(fs.existsSync(path.resolve(docsDir, relPath))).toBe(true);
    }
  });

  it("embeds up-to-date docs/getting-started/ai-agents.md in llms-full.txt and strips YAML frontmatter and container directives", () => {
    const { llmsFullTxt } = buildLlmsArtifacts(rootDir);
    const trimmedAgentGuide = guideContent.trim();

    // Starts with and embeds the full up-to-date ai-agents.md content
    expect(llmsFullTxt.startsWith(trimmedAgentGuide)).toBe(true);
    expect(llmsFullTxt).toContain(trimmedAgentGuide);

    // Includes canonical Getting Started, Guide, and Solver docs
    expect(llmsFullTxt).toContain("# Introduction & Installation");
    expect(llmsFullTxt).toContain("# Runtime Environments & Deployment");
    expect(llmsFullTxt).toContain("# Cross-Origin Isolation (Z3 & Browsers)");
    expect(llmsFullTxt).toContain("# Variables & Domains");
    expect(llmsFullTxt).toContain("# Expressions (`expr`, `sum`, `dot`)");
    expect(llmsFullTxt).toContain("# Constraints (`m.constraint` & `m.indicator`)");
    expect(llmsFullTxt).toContain("# Objectives & Solving (`m.solve` & `m.check`)");
    expect(llmsFullTxt).toContain("# Conflict Diagnosis (`unsatCore`) & Solution Validation");
    expect(llmsFullTxt).toContain("# Solvers Overview");
    expect(llmsFullTxt).toContain("# HiGHS Solver Engine");
    expect(llmsFullTxt).toContain("# Z3 SMT Solver Engine");
    expect(llmsFullTxt).toContain("# GLPK Solver Engine");
    expect(llmsFullTxt).toContain("# WaSHI Custom Solver Developer Guide");

    // No unstripped YAML frontmatter or VitePress container directives (`:::`)
    expect(llmsFullTxt).not.toMatch(/^---\n[A-Za-z0-9_-]+\s*:/m);
    expect(llmsFullTxt).not.toMatch(/^[ \t]*:::/m);

    // Verify stripVitePressSyntax directly against docs/index.md (which has YAML frontmatter) and container directives
    const homeMd = fs.readFileSync(path.resolve(docsDir, "index.md"), "utf-8");
    const strippedHome = stripVitePressSyntax(homeMd);
    expect(strippedHome).not.toContain("layout: home");
    expect(strippedHome).not.toMatch(/^---/);
    expect(strippedHome).toContain("## Quick Example");

    const synthetic = [
      "---",
      "title: Synthetic Doc",
      "layout: doc",
      "---",
      "",
      "# Synthetic Heading",
      "",
      "::: code-group",
      "```bash [npm]",
      "npm install @ohtaman/washi",
      "::: inside-fence-preserved",
      "```",
      ":::",
      "",
      "---",
      "",
      "Paragraph after horizontal rule.",
    ].join("\n");
    const strippedSynthetic = stripVitePressSyntax(synthetic);
    expect(strippedSynthetic.startsWith("# Synthetic Heading")).toBe(true);
    expect(strippedSynthetic).not.toContain("title: Synthetic Doc");
    expect(strippedSynthetic).not.toContain("::: code-group");
    expect(strippedSynthetic).toContain("::: inside-fence-preserved");
    expect(strippedSynthetic).toContain("---\n\nParagraph after horizontal rule.");
  });

  it("populates target site directory with llms.txt, llms-full.txt, and all raw English .md files referenced by llms.txt", () => {
    const tmpSiteDir = fs.mkdtempSync(path.join(os.tmpdir(), "washi-site-llms-"));
    try {
      const artifacts = buildLlmsArtifacts(rootDir);
      populateSiteLlmsAssets(tmpSiteDir, rootDir, artifacts);

      expect(fs.readFileSync(path.join(tmpSiteDir, "llms.txt"), "utf-8")).toBe(
        artifacts.llmsTxt
      );
      expect(fs.readFileSync(path.join(tmpSiteDir, "llms-full.txt"), "utf-8")).toBe(
        artifacts.llmsFullTxt
      );

      for (const relPath of artifacts.allDocFiles) {
        const siteMdPath = path.join(tmpSiteDir, relPath);
        const srcMdPath = path.join(docsDir, relPath);
        expect(fs.existsSync(siteMdPath)).toBe(true);
        expect(fs.readFileSync(siteMdPath, "utf-8")).toBe(
          fs.readFileSync(srcMdPath, "utf-8")
        );
      }
    } finally {
      fs.rmSync(tmpSiteDir, { recursive: true, force: true });
    }
  });
});


