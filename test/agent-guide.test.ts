import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import * as Washi from "../src/index.js";
import "../src/modeler/solvers/glpk/index.js";
import { killZ3Threads } from "../src/modeler/solvers/z3/index.js";

describe("AI Coding Agent Quick-Reference Guide (EN / JA / ZH ai-agents.md)", () => {
  const guidePaths = [
    "docs/getting-started/ai-agents.md",
    "docs/ja/getting-started/ai-agents.md",
    "docs/zh/getting-started/ai-agents.md",
  ];
  const guidePath = path.resolve(process.cwd(), "docs/getting-started/ai-agents.md");
  const guideContent = fs.readFileSync(guidePath, "utf-8");

  function extractTsBlocks(markdown: string): string[] {
    const blocks: string[] = [];
    const blockRegex = /```(?:ts|typescript)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(markdown)) !== null) {
      blocks.push(match[1]);
    }
    return blocks;
  }

  const codeBlocks = extractTsBlocks(guideContent);

  it("is linked with localized routes from READMEs, AGENTS.md, getting-started/index.md, and VitePress config, and shipped in package.json files", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    for (const relPath of guidePaths) {
      expect(pkg.files).toContain(relPath);
    }

    expect(
      fs.readFileSync(path.resolve(process.cwd(), "README.md"), "utf-8")
    ).toContain("docs/getting-started/ai-agents.md");
    expect(
      fs.readFileSync(path.resolve(process.cwd(), "README.ja.md"), "utf-8")
    ).toContain("docs/ja/getting-started/ai-agents.md");
    expect(
      fs.readFileSync(path.resolve(process.cwd(), "README.zh-CN.md"), "utf-8")
    ).toContain("docs/zh/getting-started/ai-agents.md");
    expect(
      fs.readFileSync(path.resolve(process.cwd(), "AGENTS.md"), "utf-8")
    ).toContain("docs/getting-started/ai-agents.md");

    expect(
      fs.readFileSync(path.resolve(process.cwd(), "docs/getting-started/index.md"), "utf-8")
    ).toContain("./ai-agents.md");
    expect(
      fs.readFileSync(path.resolve(process.cwd(), "docs/ja/getting-started/index.md"), "utf-8")
    ).toContain("./ai-agents.md");
    expect(
      fs.readFileSync(path.resolve(process.cwd(), "docs/zh/getting-started/index.md"), "utf-8")
    ).toContain("/zh/getting-started/ai-agents");

    const vpConfig = fs.readFileSync(
      path.resolve(process.cwd(), "docs/.vitepress/config.mts"),
      "utf-8"
    );
    expect(vpConfig).toContain('link: "/getting-started/ai-agents"');
    expect(vpConfig).toContain('link: "/ja/getting-started/ai-agents"');
    expect(vpConfig).toContain('link: "/zh/getting-started/ai-agents"');
  });

  it("type-checks all extracted guide code blocks across EN, JA, and ZH and verifies package export subpaths and symbols", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    const exportSubpaths = new Set(
      Object.keys(pkg.exports).map((k) =>
        k === "." ? "@ohtaman/washi" : `@ohtaman/washi/${k.replace(/^\.\//, "")}`
      )
    );

    const rewriteImports = (src: string) =>
      src
        .replaceAll('"@ohtaman/washi/solvers/z3"', '"../src/modeler/solvers/z3/index.js"')
        .replaceAll('"@ohtaman/washi/solvers/glpk"', '"../src/modeler/solvers/glpk/index.js"')
        .replaceAll('"@ohtaman/washi"', '"../src/index.js"');

    for (const relPath of guidePaths) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
      const blocks = extractTsBlocks(content);
      expect(blocks.length, `Expected 7 TS blocks in ${relPath}`).toBe(7);

      const importBlock = blocks[0];
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
          `Expected symbol '${sym}' documented in ${relPath} to be exported from @ohtaman/washi`
        ).toBe(true);
      }

      for (const block of blocks) {
        const specifierRegex = /from\s+["'](@ohtaman\/washi[^"']*)["']|import\s+["'](@ohtaman\/washi[^"']*)["']/g;
        let specMatch: RegExpExecArray | null;
        while ((specMatch = specifierRegex.exec(block)) !== null) {
          const spec = specMatch[1] ?? specMatch[2];
          expect(exportSubpaths.has(spec)).toBe(true);
        }
      }

      // Type-check all guide snippets against src/ using tsc
      const slug = relPath.replace(/[^a-zA-Z0-9]/g, "-");
      const tmpBase = `.tmp-agent-guide-${slug}-${process.pid}`;
      const tmpTsPath = path.resolve(process.cwd(), `test/${tmpBase}.ts`);
      const tmpTsconfigPath = path.resolve(process.cwd(), `test/${tmpBase}-tsconfig.json`);
      const combinedSource = [
        rewriteImports(blocks[0]),
        `export function __step1And3() {\n${blocks[1]}\n${blocks[2]}\n}`,
        ...blocks.slice(3).map((b) => rewriteImports(b).replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")),
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
          throw new Error(`tsc typecheck failed for ${relPath}:\n${err.stdout || err.stderr || err.message}`);
        }
      } finally {
        fs.rmSync(tmpTsPath, { force: true });
        fs.rmSync(tmpTsconfigPath, { force: true });
      }
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

  it("does not advertise nonexistent APIs or types in guide prose or comments across EN, JA, and ZH", () => {
    const sampleModel = new Washi.Model("MemberCheck");
    for (const relPath of guidePaths) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
      expect(content).not.toContain("subjectTo");
      expect(content).not.toContain("m.getValue(");
      expect(content).not.toContain(".iff(");
      expect(content).not.toContain("ModelStatus");
      expect(content).not.toContain("TypedArray");
      expect(content).not.toMatch(/\bm\.(maximize|minimize)\s*=/);
      expect(content).not.toMatch(/`dot\(a,\s*b\)`[^\n]*`Iterable`/);
      expect(content).toContain("SolverStatus");
      expect(content).toContain("isSecureContext");
      expect(content).toContain("Access-Control-Allow-Origin");
      expect(content).toContain("conflicts?:");
      expect(content).toContain("unsatCore?:");

      const solverStatusLine = content
        .split("\n")
        .find((line) => line.includes("`SolverStatus`") && line.includes('"Optimal"'));
      expect(solverStatusLine, `Missing SolverStatus line in ${relPath}`).toBeDefined();
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
      const positiveGuide = content.split(/^## 4\./m)[0];
      const memberRegex = /\bm\.([a-zA-Z_]\w*)/g;
      let memberMatch: RegExpExecArray | null;
      while ((memberMatch = memberRegex.exec(positiveGuide)) !== null) {
        const member = memberMatch[1];
        expect(
          member in sampleModel,
          `Expected 'm.${member}' referenced in positive guide sections of ${relPath} to exist on Model`
        ).toBe(true);
      }
    }
  });
});

