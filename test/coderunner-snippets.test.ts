import { describe, it, expect, vi } from "vitest";
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
      expect(content).not.toContain("@0.4.0");
    }

    for (const docFile of mdFiles) {
      const rawContent = fs.readFileSync(docFile, "utf-8");
      // Exclude the intentional Negative Examples section in ai-agents.md (EN/JA/ZH)
      const content = docFile.endsWith("ai-agents.md")
        ? rawContent.split(/^## 4\./m)[0]
        : rawContent;
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
      expect(content, `Incorrect objectiveBound null comment in ${docFile}`).not.toMatch(
        /m\.objectiveBound\);\s*\/\/.*null/
      );
      expect(content, `Stale @0.4.0 CDN URL in ${docFile}`).not.toContain("@0.4.0");
      expect(rawContent, `Deleted custom-solver-guide.md ref in ${docFile}`).not.toContain("custom-solver-guide.md");

      if (docFile.endsWith("highs.md")) {
        expect(content, `Stale verbose: true in ${docFile}`).not.toContain("verbose: true");
        expect(content, `Missing outputFlag: true in ${docFile}`).toContain("outputFlag: true");
      }
      if (docFile.endsWith("custom-solver.md")) {
        expect(content, `Unmapped status in ${docFile}`).not.toContain('payload.status === "OPTIMAL"');
        expect(content, `Missing statusMap in ${docFile}`).toContain("statusMap");
        expect(content, `Missing AbortError handling in ${docFile}`).toContain("AbortError");
      }
      expect(content, `Invalid Var.div() in ${docFile}`).not.toMatch(/\|\s*`\.div\(divisor\)`\s*\|\s*`Var`/);

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
    expect(mMock.objectiveBound).toBeUndefined();
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
    expect(diag.conflicts).toEqual(
      expect.arrayContaining(["minimum_regulatory_reserve", "budget_ceiling"])
    );

    // 6. Bounded ProductionRevenue model + onProgress/AbortSignal (docs/guide/objectives.md)
    const mRev = new Model("ProductionRevenue");
    const rx1 = mRev.integer("x", { lb: 0, ub: 40 });
    const ry1 = mRev.integer("y", { lb: 0, ub: 40 });
    mRev.objective(maximize(expr`50 * ${rx1} + 40 * ${ry1}`));
    mRev.constraint(expr`2 * ${rx1} + 3 * ${ry1} <= 100`, "resource_limit");
    const revStatus = await mRev.solve();
    expect(revStatus).toBe("Optimal");
    expect(mRev.objectiveValue).toBe(2240);

    // 7. CloudSolver pattern AbortError and status normalization (docs/solvers/custom-solver.md)
    const { generateLpString } = Washi;
    class TestCloudSolver {
      public readonly name = "TestCloud";
      public readonly version = "1.0.0";
      public readonly capabilities = { supportsMIP: true, supportsQP: false };
      private mockHandler: (body: any, signal?: AbortSignal) => Promise<any>;
      constructor(mockHandler: (body: any, signal?: AbortSignal) => Promise<any>) {
        this.mockHandler = mockHandler;
      }
      async solve(modelData: any, options: any = {}) {
        const startTime = performance.now();
        const { lpString, nameToVar } = generateLpString(modelData);
        let payload: any;
        try {
          payload = await this.mockHandler({ lp: lpString }, options.signal);
        } catch (err: any) {
          if (options.signal?.aborted || err?.name === "AbortError") {
            return {
              status: "Unknown" as const,
              terminationStatus: "Interrupted" as const,
              objectiveValue: null,
              values: {},
              runTime: (performance.now() - startTime) / 1000,
            };
          }
          throw err;
        }
        const values: Record<string, number> = Object.create(null);
        for (const [k, val] of Object.entries((payload.values || {}) as Record<string, number>)) {
          values[nameToVar.get(k)?.name ?? k] = val;
        }
        const statusMap: Record<string, any> = {
          OPTIMAL: "Optimal",
          FEASIBLE: "Feasible",
          INFEASIBLE: "Infeasible",
          UNBOUNDED: "Unbounded",
          TIME_LIMIT: "TimeLimit",
          TIMELIMIT: "TimeLimit",
          ITERATION_LIMIT: "IterationLimit",
        };
        const status = statusMap[String(payload.status).toUpperCase()] ?? "Unknown";
        return {
          status,
          objectiveValue: payload.objectiveValue ?? null,
          values,
          runTime: (performance.now() - startTime) / 1000,
        };
      }
    }

    const infeasCloud = new TestCloudSolver(async () => ({
      status: "INFEASIBLE",
      objectiveValue: null,
      values: {},
    }));
    const mCloud1 = new Model({ solver: infeasCloud as any });
    const c1 = mCloud1.integer("x");
    mCloud1.constraint(expr`${c1} >= 10`);
    const s1 = await mCloud1.solve();
    expect(s1).toBe("Infeasible");

    const abortCloud = new TestCloudSolver(async (_body, signal) => {
      if (signal?.aborted) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      return { status: "OPTIMAL", objectiveValue: 10, values: { x: 10 } };
    });
    const mCloud2 = new Model({ solver: abortCloud as any });
    const c2 = mCloud2.integer("x");
    mCloud2.constraint(expr`${c2} >= 10`);
    const abortCtrl = new AbortController();
    abortCtrl.abort();
    const res2 = await mCloud2.solve({ signal: abortCtrl.signal });
    expect(res2).toBe("Unknown");
    expect(mCloud2.status).toBe("Unknown");
  });

  it("maintains full 26-page parity across English (docs/), Chinese (docs/zh/), and Japanese (docs/ja/)", () => {
    const enPages = mdFiles
      .map((f) => path.relative(docsDir, f).replace(/\\/g, "/"))
      .filter((rel) => !rel.startsWith("ja/") && !rel.startsWith("zh/"))
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

    expect(enPages).toHaveLength(26);
    expect(enPages).toContain("showcase/index.md");
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

  it("verifies custom-solver.md Section 5 mocks fetch across EN/JA/ZH and VitePress config translates all local-search controls", async () => {
    const customSolverPaths = [
      "docs/solvers/custom-solver.md",
      "docs/ja/solvers/custom-solver.md",
      "docs/zh/solvers/custom-solver.md",
    ];
    const { Model, expr, maximize, generateLpString, registerSolver } = Washi;

    for (const relPath of customSolverPaths) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
      const section5 = content.split(/^## 5\./m)[1] ?? "";
      expect(section5, `Missing Section 5 in ${relPath}`).toContain('vi.spyOn(globalThis, "fetch")');
      expect(section5, `Missing fetchSpy.mockRestore() in ${relPath}`).toContain("fetchSpy.mockRestore()");

      // Extract the actual CloudSolver implementation block from Section 3 of each locale guide
      const tsBlocks = [...content.matchAll(/```typescript\n([\s\S]*?)```/g)].map((m) => m[1]);
      const cloudSolverTs = tsBlocks.find((b) => b.includes("export class CloudSolver"));
      expect(cloudSolverTs, `Missing CloudSolver block in ${relPath}`).toBeDefined();

      const jsCode = stripTypeScriptTypes(cloudSolverTs!)
        .replace(/^\s*import\s+[\s\S]*?from\s+["']@ohtaman\/washi["'];?\s*$/gm, "")
        .replace(/\bexport\s+(class|function)\b/g, "$1");

      const CloudSolverClass = new Function(
        "generateLpString",
        "registerSolver",
        `${jsCode}\nreturn CloudSolver;`
      )(generateLpString, registerSolver);

      const runWithPayload = async (payloadObj: Record<string, unknown>) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify(payloadObj), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
        try {
          const model = new Model({ solver: new CloudSolverClass() });
          const x = model.continuous("x", { lb: 0, ub: 10 });
          const y = model.continuous("y", { lb: 0, ub: 10 });
          model.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
          model.constraint(expr`${x} + ${y} <= 12`, "budget");
          const status = await model.solve();
          return { model, x, y, c1: model.getConstraintByName("budget"), status };
        } finally {
          fetchSpy.mockRestore();
        }
      };

      // 1. OPTIMAL with incumbent and duals
      const opt = await runWithPayload({
        status: "OPTIMAL",
        objectiveValue: 34,
        values: { x: 2, y: 10 },
        duals: { budget: 2 },
      });
      expect(opt.status).toBe("Optimal");
      expect(opt.model.terminationStatus).toBe("Optimal");
      expect(opt.model.hasPrimalSolution).toBe(true);
      expect(opt.x.value).toBe(2);
      expect(opt.y.value).toBe(10);
      expect(opt.c1?.dual).toBe(2);

      // 2. TIME_LIMIT and ITERATION_LIMIT WITH a feasible incumbent -> status "Feasible", terminationStatus preserved
      for (const [rawStop, expectedTerm] of [
        ["TIME_LIMIT", "TimeLimit"],
        ["ITERATION_LIMIT", "IterationLimit"],
      ] as const) {
        const inc = await runWithPayload({
          status: rawStop,
          objectiveValue: 34,
          values: { x: 2, y: 10 },
        });
        expect(inc.status, `${relPath} ${rawStop} with incumbent status`).toBe("Feasible");
        expect(inc.model.status).toBe("Feasible");
        expect(inc.model.terminationStatus).toBe(expectedTerm);
        expect(inc.model.hasPrimalSolution).toBe(true);
        expect(inc.model.objectiveValue).toBe(34);
        expect(inc.x.value).toBe(2);
        expect(inc.y.value).toBe(10);
      }

      // 3. TIME_LIMIT and ITERATION_LIMIT WITHOUT an incumbent -> retains limit status, hasPrimalSolution false
      for (const [rawStop, expectedTerm] of [
        ["TIME_LIMIT", "TimeLimit"],
        ["ITERATION_LIMIT", "IterationLimit"],
      ] as const) {
        const noInc = await runWithPayload({
          status: rawStop,
          objectiveValue: null,
          values: {},
        });
        expect(noInc.status, `${relPath} ${rawStop} without incumbent status`).toBe(expectedTerm);
        expect(noInc.model.status).toBe(expectedTerm);
        expect(noInc.model.terminationStatus).toBe(expectedTerm);
        expect(noInc.model.hasPrimalSolution).toBe(false);
        expect(noInc.model.objectiveValue).toBeNull();
        expect(noInc.x.value).toBeNull();
      }
    }

    // Verify all LocalSearchTranslations keys are present for both ja and zh in docs/.vitepress/config.mts
    const configContent = fs.readFileSync(
      path.resolve(process.cwd(), "docs/.vitepress/config.mts"),
      "utf-8"
    );
    const requiredSearchKeys = [
      "buttonText",
      "buttonAriaLabel",
      "displayDetails",
      "resetButtonTitle",
      "backButtonTitle",
      "noResultsText",
      "selectText",
      "selectKeyAriaLabel",
      "navigateText",
      "navigateUpKeyAriaLabel",
      "navigateDownKeyAriaLabel",
      "closeText",
      "closeKeyAriaLabel",
    ];
    for (const key of requiredSearchKeys) {
      const matches = configContent.match(new RegExp(`\\b${key}:`, "g")) ?? [];
      expect(matches.length, `Expected search translation key '${key}' in both ja and zh`).toBeGreaterThanOrEqual(2);
    }
  });

  it("maintains unified nav, hero actions, and showcase hub pages across EN, JA, and ZH", async () => {
    const vpConfigModule = await import("../docs/.vitepress/config.mts");
    const vpConfig = vpConfigModule.default;
    const viteConfigModule = await import("../vite.config.ts");
    const viteInputs = new Set<string>(
      Object.values(
        (viteConfigModule.default.build?.rollupOptions?.input ?? {}) as Record<string, string>
      )
    );

    const expectedLocales = [
      {
        key: "root",
        prefix: "",
        homeFile: "docs/index.md",
        showcaseFile: "docs/showcase/index.md",
        gettingStartedText: "Getting Started",
        gettingStartedLink: "/getting-started/",
        showcaseText: "Showcase",
        showcaseLink: "/showcase/",
        sheepTitle: "Fluffy Sheep Pasture Enclosure",
      },
      {
        key: "ja",
        prefix: "/ja",
        homeFile: "docs/ja/index.md",
        showcaseFile: "docs/ja/showcase/index.md",
        gettingStartedText: "はじめに",
        gettingStartedLink: "/ja/getting-started/",
        showcaseText: "ショーケース",
        showcaseLink: "/ja/showcase/",
        sheepTitle: "もふもふ羊の牧場囲い",
      },
      {
        key: "zh",
        prefix: "/zh",
        homeFile: "docs/zh/index.md",
        showcaseFile: "docs/zh/showcase/index.md",
        gettingStartedText: "快速入门",
        gettingStartedLink: "/zh/getting-started/",
        showcaseText: "案例展示",
        showcaseLink: "/zh/showcase/",
        sheepTitle: "毛茸茸绵羊的牧场围栏",
      },
    ] as const;

    for (const loc of expectedLocales) {
      const localeConfig = vpConfig.locales?.[loc.key];
      const nav = localeConfig?.themeConfig?.nav ?? [];
      expect(nav.map((item: { text: string; link: string }) => ({ text: item.text, link: item.link }))).toEqual([
        { text: loc.gettingStartedText, link: loc.gettingStartedLink },
        { text: loc.showcaseText, link: loc.showcaseLink },
      ]);

      const gsRegex = new RegExp(nav[0].activeMatch);
      const showcaseRegex = new RegExp(nav[1].activeMatch);
      for (const docSection of ["getting-started/", "guide/variables", "solvers/", "examples/production"]) {
        expect(gsRegex.test(`${loc.prefix}/${docSection}`)).toBe(true);
        expect(showcaseRegex.test(`${loc.prefix}/${docSection}`)).toBe(false);
      }
      expect(showcaseRegex.test(`${loc.prefix}/showcase/`)).toBe(true);
      expect(gsRegex.test(`${loc.prefix}/showcase/`)).toBe(false);
      expect(gsRegex.test(`${loc.prefix || "/"}`)).toBe(false);
      expect(showcaseRegex.test(`${loc.prefix || "/"}`)).toBe(false);

      const homeRaw = fs.readFileSync(path.resolve(process.cwd(), loc.homeFile), "utf-8");
      const actionsBlockMatch = homeRaw.match(/actions:\n([\s\S]*?)\n\nfeatures:/);
      expect(actionsBlockMatch, `Missing actions block in ${loc.homeFile}`).not.toBeNull();
      const actionTexts = Array.from(
        actionsBlockMatch![1].matchAll(/^\s*text:\s*(.+)$/gm),
        (m) => m[1].trim()
      );
      const actionLinks = Array.from(
        actionsBlockMatch![1].matchAll(/^\s*link:\s*(.+)$/gm),
        (m) => m[1].trim()
      );
      expect(actionTexts).toEqual([loc.gettingStartedText, loc.showcaseText]);
      expect(actionLinks).toEqual([loc.gettingStartedLink, loc.showcaseLink]);

      const showcasePath = path.resolve(process.cwd(), loc.showcaseFile);
      expect(fs.existsSync(showcasePath), `Missing ${loc.showcaseFile}`).toBe(true);
      const showcaseRaw = fs.readFileSync(showcasePath, "utf-8");
      expect(showcaseRaw).toContain(loc.sheepTitle);

      const cardDivs = Array.from(
        showcaseRaw.matchAll(/<div\s+([^>]*\bclass="washi-showcase-card(?:\s+[^"]*)?"[^>]*)>/g),
        (m) => m[1]
      );
      expect(cardDivs).toHaveLength(6);

      const ctaAnchors = Array.from(
        showcaseRaw.matchAll(/<a\s+([^>]*class="washi-showcase-cta"[^>]*)>/g),
        (m) => m[1]
      );
      expect(ctaAnchors).toHaveLength(6);

      const thumbImgs = Array.from(
        showcaseRaw.matchAll(/<img\s+([^>]*class="washi-showcase-thumb-img"[^>]*)>/g),
        (m) => m[1]
      );
      expect(thumbImgs).toHaveLength(6);
      for (const imgAttrs of thumbImgs) {
        const srcMatch = imgAttrs.match(/\bsrc="([^"]+)"/);
        expect(srcMatch, `Missing src in showcase thumbnail <img ${imgAttrs}>`).not.toBeNull();
        const src = srcMatch![1];
        expect(src).toMatch(/^\/showcase\/thumb-[a-z0-9-]+\.png$/);
        const subpath = src.replace(/^\//, "");
        const expectedFile = path.resolve(process.cwd(), "docs/public", subpath);
        expect(
          fs.existsSync(expectedFile),
          `Showcase image ${src} in ${loc.showcaseFile} missing at ${expectedFile}`
        ).toBe(true);
      }

      const theoryAnchors = Array.from(
        showcaseRaw.matchAll(/<a\s+([^>]*class="washi-showcase-theory-btn"[^>]*)>/g),
        (m) => m[1]
      );
      expect(theoryAnchors).toHaveLength(4);

      const allShowcaseAnchors = Array.from(
        showcaseRaw.matchAll(/<a\s+([^>]*class="washi-showcase-(?:cta|theory-btn|title-link)"[^>]*)>/g),
        (m) => m[1]
      );
      for (const attrs of allShowcaseAnchors) {
        const targetMatch = attrs.match(/\btarget="([^"]+)"/);
        expect(
          targetMatch?.[1],
          `Showcase anchor <a ${attrs}> in ${loc.showcaseFile} must set target="_self" to bypass VitePress SPA router 404 interception`
        ).toBe("_self");
      }

      const primaryHrefs = ctaAnchors.map((attrs) => {
        const hrefMatch = attrs.match(/\bhref="([^"]+)"/);
        expect(hrefMatch, `Missing href in showcase CTA <a ${attrs}>`).not.toBeNull();
        return hrefMatch![1];
      });
      expect(primaryHrefs).toEqual([
        "/washi/demo/",
        "/washi/apps/ai-shift/",
        "/washi/apps/ai-timetable/",
        "/washi/games/demon-castle-shift/",
        "/washi/games/mofumofu-sheep/",
        "/washi/games/quant-survival/",
      ]);

      const langParam = loc.key === "root" ? "en" : loc.key;
      const theoryHrefs = theoryAnchors.map((attrs) => {
        const hrefMatch = attrs.match(/\bhref="([^"]+)"/);
        expect(hrefMatch, `Missing href in showcase theory CTA <a ${attrs}>`).not.toBeNull();
        return hrefMatch![1];
      });
      expect(theoryHrefs).toEqual([
        `/washi/apps/ai-timetable-theory/?lang=${langParam}`,
        `/washi/games/demon-castle-shift-theory/?lang=${langParam}`,
        `/washi/games/mofumofu-sheep-theory/?lang=${langParam}`,
        `/washi/games/quant-survival-theory/?lang=${langParam}`,
      ]);

      for (const href of [...primaryHrefs, ...theoryHrefs]) {
        const cleanHref = href.split("?")[0];
        const subpath = cleanHref.replace(/^\/washi\//, "");
        const expectedEntryHtml = path.resolve(
          process.cwd(),
          "examples/web-demo",
          subpath,
          "index.html"
        );
        expect(
          fs.existsSync(expectedEntryHtml),
          `Showcase link ${href} in ${loc.showcaseFile} points to missing ${expectedEntryHtml}`
        ).toBe(true);
        expect(
          viteInputs.has(expectedEntryHtml),
          `Showcase link ${href} in ${loc.showcaseFile} is not built by vite.config.ts`
        ).toBe(true);
      }
    }

    for (const componentFile of [
      "docs/.vitepress/theme/components/CodeRunner.vue",
      "docs/.vitepress/theme/components/EcommerceCouponDemo.vue",
      "docs/.vitepress/theme/components/PortfolioQpDemo.vue",
      "docs/.vitepress/theme/components/ShiftSchedulingDemo.vue",
    ]) {
      const compRaw = fs.readFileSync(path.resolve(process.cwd(), componentFile), "utf-8");
      const playgroundAnchors = Array.from(
        compRaw.matchAll(/<a\s+([\s\S]*?class="playground-link"[\s\S]*?)>/g),
        (m) => m[1]
      );
      expect(playgroundAnchors.length, `Expected .playground-link anchor in ${componentFile}`).toBeGreaterThan(0);
      for (const attrs of playgroundAnchors) {
        expect(
          attrs,
          `Playground link in ${componentFile} must include target="_self" to bypass VitePress SPA router`
        ).toMatch(/\btarget="_self"/);
      }
    }

    const themeIndexRaw = fs.readFileSync(
      path.resolve(process.cwd(), "docs/.vitepress/theme/index.ts"),
      "utf-8"
    );
    expect(themeIndexRaw).toContain("router.onBeforeRouteChange");
    expect(themeIndexRaw).toMatch(/demo\|apps\|games/);

    const gamesIndexRaw = fs.readFileSync(
      path.resolve(process.cwd(), "examples/web-demo/games/index.html"),
      "utf-8"
    );
    expect(gamesIndexRaw).toContain('id="portal-back-showcase"');

    const appsIndexRaw = fs.readFileSync(
      path.resolve(process.cwd(), "examples/web-demo/apps/index.html"),
      "utf-8"
    );
    expect(appsIndexRaw).toContain('id="apps-back-showcase"');

    const demoIndexRaw = fs.readFileSync(
      path.resolve(process.cwd(), "examples/web-demo/demo/index.html"),
      "utf-8"
    );
    expect(demoIndexRaw).toContain('data-i18n="navShowcase"');
    expect(demoIndexRaw).toContain('id="nav-showcase"');

    const appTsRaw = fs.readFileSync(
      path.resolve(process.cwd(), "examples/web-demo/src/ui/app.ts"),
      "utf-8"
    );
    expect(appTsRaw).toContain('navShowcase.setAttribute("href", locale === "ja" ? "../ja/showcase/" : "../showcase/")');
  });
});
