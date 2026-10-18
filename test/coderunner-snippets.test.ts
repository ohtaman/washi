import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import * as Washi from "../src/index.js";
import "../src/modeler/solvers/z3.js";
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

  it("extracts all documentation code snippets (27 expected across EN, JA, and ZH)", () => {
    expect(snippets.length).toBe(27);
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
      expect(content).not.toContain("bestBound");
      expect(content).not.toContain("iterationCount");
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
      expect(content, `Invalid SolutionValidationOptions/Report field in ${docFile}`).not.toMatch(
        /\b(absTol|relTol|integralityTol|maxBoundViolation|maxIntegralityViolation|maxConstraintViolation|objectiveDiscrepancy|checkedSolveStatus)\b/
      );
      expect(content, `Invalid MockSolver defaultResult wrapper in ${docFile}`).not.toContain("defaultResult");
      expect(content, `Invalid SolveProgressEvent field in ${docFile}`).not.toMatch(/\b(bestBound|iterationCount)\b/);
      expect(content, `Invalid two-argument objective call in ${docFile}`).not.toContain(', "Maximize")');
      expect(content, `Invalid Interrupted row in SolverStatus table in ${docFile}`).not.toContain('| `"Interrupted"` | `false` |');
      expect(content, `Invalid boolean presolve type in ${docFile}`).not.toMatch(/presolve.*boolean/);
      expect(content, `Invalid numConstraints property in ${docFile}`).not.toContain("numConstraints");
      expect(content, `Invalid Promise<SolverCheckResult> for m.check() in ${docFile}`).not.toContain(
        "| `Promise<SolverCheckResult>` |"
      );
      expect(content, `Invalid "Empty" in SolverStatus list in ${docFile}`).not.toContain('- `"Empty"`');
      expect(content, `Incorrect negated LP objective in ${docFile}`).not.toContain("obj: - 5 x");
      expect(content, `Incorrect highs.worker.js asset name in ${docFile}`).not.toContain("highs.worker.js");
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

  it("executes guide examples for validateSolution, MockSolver, batch constraint, LinExpr.value, numConstrs, toLpString, and check() at runtime", async () => {
    const { Model, MockSolver, expr, maximize } = Washi;

    // 1. MockSolver flat options (docs/guide/unsat-core.md)
    const mock = new MockSolver({
      status: "Optimal",
      objectiveValue: 420,
      values: { x: 10, y: 20 },
    });
    const mMock = new Model({ solver: mock });
    const mx = mMock.integer("x");
    const my = mMock.integer("y");
    mMock.objective(maximize(expr`10 * ${mx} + 16 * ${my}`));
    await mMock.solve();
    expect(mMock.objectiveValue).toBe(420);
    expect(mx.value).toBe(10);
    expect(my.value).toBe(20);

    // 2. SolutionValidationOptions & SolutionValidationReport + LinExpr.value + numConstrs (docs/guide/unsat-core.md, expressions.md, constraints.md)
    const m = new Model();
    const x = m.integer("x", { lb: 0 });
    const y = m.integer("y", { lb: 0 });
    const revenue = expr`30 * ${x} + 50 * ${y}`;
    const laborUsed = expr`2 * ${x} + ${y}`;
    m.objective(maximize(revenue));
    m.constraint([expr`${x} + 2 * ${y} <= 40`, expr`${laborUsed} <= 50`]);
    expect(m.numConstrs).toBe(2);
    expect((m as Record<string, unknown>).numConstraints).toBeUndefined();
    await m.solve();

    expect(revenue.value).toBe(1100);
    expect(laborUsed.value).toBe(50);

    const report = m.validateSolution({
      feasibilityTolerance: 1e-6,
      integralityTolerance: 1e-6,
      evaluateLogicalConstraints: true,
    });
    expect(report.valid).toBe(true);
    expect(report.complete).toBe(true);
    expect(report.maxViolation).toBe(0);
    expect(report.summary.checkedLinearConstraints).toBe(2);

    // 3. m.toLpString() exact output (docs/guide/unsat-core.md)
    const mDebug = new Model("DebugModel");
    const dx = mDebug.integer("x", { lb: 0, ub: 10 });
    mDebug.objective(maximize(expr`5 * ${dx}`));
    mDebug.constraint(expr`2 * ${dx} <= 15`, "resource_limit");
    expect(mDebug.toLpString().trim()).toBe(
      [
        "Maximize",
        " obj: 5 x",
        "Subject To",
        " resource_limit: 2 x <= 15",
        "Bounds",
        " 0 <= x <= 10",
        "Generals",
        " x",
        "End",
      ].join("\n")
    );

    // 4. m.check() CheckResult shape (docs/guide/objectives.md)
    const checkRes = await mDebug.check();
    expect(checkRes.status).toBe("Sat");
    expect(typeof checkRes.values.x).toBe("number");
    expect("boolValues" in checkRes).toBe(false);

    // 5. HiGHS solve() -> Z3 check({ solver: "z3" }) diagnostic workflow (docs/guide/unsat-core.md)
    const mDiag = new Model();
    expect(mDiag.solver).toBeNull(); // Uses default HiGHS on mDiag.solve()
    const rx = mDiag.continuous("reserve", { lb: 0 });
    mDiag.constraint(expr`${rx} >= 100`, "minimum_regulatory_reserve");
    mDiag.constraint(expr`${rx} <= 50`, "budget_ceiling");
    mDiag.constraint(expr`${rx} >= 10`, "routine_operating_cost");
    const solveStatus = await mDiag.solve();
    expect(solveStatus).toBe("Infeasible");
    const diag = await mDiag.check({ solver: "z3" });
    expect(diag.status).toBe("Unsat");
    expect(diag.conflicts).toEqual(["minimum_regulatory_reserve", "budget_ceiling"]);
  });

  it("maintains full page parity across English (docs/), Chinese (docs/zh/), and Japanese (docs/ja/)", () => {
    const enPages = mdFiles
      .map((f) => path.relative(docsDir, f).replace(/\\/g, "/"))
      .filter((rel) => !rel.startsWith("ja/") && !rel.startsWith("zh/") && rel !== "getting-started/ai-agents.md")
      .sort();
    const jaPages = mdFiles
      .map((f) => path.relative(docsDir, f).replace(/\\/g, "/"))
      .filter((rel) => rel.startsWith("ja/"))
      .map((rel) => rel.slice(3))
      .sort();
    const zhPages = mdFiles
      .map((f) => path.relative(docsDir, f).replace(/\\/g, "/"))
      .filter((rel) => rel.startsWith("zh/"))
      .map((rel) => rel.slice(3))
      .sort();

    expect(jaPages).toEqual(enPages);
    expect(zhPages).toEqual(enPages);
  });

  it("executes VitePress interactive demo components (PortfolioQpDemo, EcommerceCouponDemo, ShiftSchedulingDemo) at runtime", async () => {
    const componentsDir = path.resolve(process.cwd(), "docs/.vitepress/theme/components");
    const demoSpecs = [
      { file: "PortfolioQpDemo.vue", fn: "solvePortfolio", check: "varianceVal.value > 0 && isZh.value === true && isJa.value === false" },
      { file: "EcommerceCouponDemo.vue", fn: "solveCart", check: "netPayableWithFiller.value > 0 && isZh.value === true && isJa.value === false" },
      { file: "ShiftSchedulingDemo.vue", fn: "solveRoster", check: "status.value === 'Optimal' && isZh.value === true && isJa.value === false" },
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
        () => ({ lang: { value: "zh-CN" } }),
        async () => Washi,
        {}
      );
      expect(ok).toBe(true);
    }
  });
});
