import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import * as Washi from "../src/index.js";
import "../src/modeler/solvers/pumpkin.js";
import "../src/modeler/solvers/z3.js";
import { transpileSnippetToJs } from "../docs/.vitepress/theme/utils/transpile.js";
import {
  resetSnippetRunnerStateForTests,
  runWashiSnippet,
} from "../docs/.vitepress/theme/utils/runSnippet.js";

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

  it("extracts all documentation code snippets (36 expected across EN, JA, and ZH)", () => {
    expect(snippets.length).toBe(36);
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

  it("verifies shipped READMEs and docs/ contain no retired API calls and all TypeScript blocks parse cleanly", () => {
    for (const readmeFile of ["README.md", "README.ja.md", "README.zh-CN.md"]) {
      const content = fs.readFileSync(path.resolve(process.cwd(), readmeFile), "utf-8");
      expect(content).not.toMatch(
        /\.(constrain|optimize|setObjective|vars|constrs|getValues?|lessThanOrEqual|greaterThanOrEqual|equalTo)\b/
      );
      expect(content).not.toMatch(/\b(?:m|model)\.(minimize|maximize)\b/);
    }

    for (const docFile of mdFiles) {
      const rawContent = fs.readFileSync(docFile, "utf-8");
      // Exclude the intentional Negative Examples section in ai-agents.md
      const content = docFile.endsWith("ai-agents.md")
        ? rawContent.split(/^## 4\./m)[0]
        : rawContent;
      expect(content, `Retired API in ${docFile}`).not.toMatch(
        /\.(constrain|optimize|setObjective|vars|constrs|getValues?|lessThanOrEqual|greaterThanOrEqual|equalTo)\b/
      );
      expect(content, `Retired m.minimize/maximize in ${docFile}`).not.toMatch(
        /\b(?:m|model)\.(minimize|maximize)\b/
      );

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

  it("executes guide examples for verify, MockSolver, batch constraint, LinExpr.value, constraints.size, toLpString, and check() at runtime", async () => {
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

    // 2. VerifyOptions & VerificationReport + LinExpr.value + constraints.size (docs/guide/unsat-core.md, expressions.md, constraints.md)
    const m = new Model();
    const x = m.integer("x", { lb: 0 });
    const y = m.integer("y", { lb: 0 });
    const revenue = expr`30 * ${x} + 50 * ${y}`;
    const laborUsed = expr`2 * ${x} + ${y}`;
    m.objective(maximize(revenue));
    m.constraint([expr`${x} + 2 * ${y} <= 40`, expr`${laborUsed} <= 50`]);
    expect(m.constraints.size).toBe(2);
    expect("numConstrs" in m).toBe(false);
    expect("numConstraints" in m).toBe(false);
    await m.solve();

    expect(revenue.value).toBe(1100);
    expect(laborUsed.value).toBe(50);

    const report = m.verify({
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

  it("maintains full 33-page human documentation parity across English (docs/), Chinese (docs/zh/), and Japanese (docs/ja/)", () => {
    const enHumanPages = mdFiles
      .map((f) => path.relative(docsDir, f).replace(/\\/g, "/"))
      .filter(
        (rel) => !rel.startsWith("ja/") && !rel.startsWith("zh/") && rel !== "getting-started/ai-agents.md"
      )
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

    expect(enHumanPages).toHaveLength(33);
    expect(enHumanPages).not.toContain("getting-started/ecosystem.md");
    expect(enHumanPages).toContain("getting-started/coding-agents.md");
    expect(enHumanPages).toContain("guide/constraint-programming.md");
    expect(enHumanPages).toContain("guide/formulation-tips.md");
    expect(enHumanPages).toContain("solvers/pumpkin.md");
    expect(enHumanPages).toContain("examples/project-scheduling.md");
    expect(enHumanPages).toContain("showcase/index.md");
    expect(jaPages).toEqual(enHumanPages);
    expect(zhPages).toEqual(enHumanPages);
  });

  it("executes all formulation-tips.md and decomposition.md snippets across EN/JA/ZH and verifies mathematical invariants", async () => {
    const runDocBlock = async <T>(tsSource: string, tailExpr: string): Promise<T> => {
      const stripped = stripTypeScriptTypes(tsSource).replace(
        /^\s*import\s+[\s\S]*?from\s+["']@ohtaman\/washi["'];?\s*$/gm,
        ""
      );
      const fn = new Function(
        "Washi",
        `const { Model, expr, sum, dot, minimize, maximize } = Washi;\nreturn (async () => {\n${stripped}\nreturn ${tailExpr};\n})();`
      );
      return fn(Washi) as Promise<T>;
    };

    for (const relPath of [
      "docs/guide/formulation-tips.md",
      "docs/ja/guide/formulation-tips.md",
      "docs/zh/guide/formulation-tips.md",
    ]) {
      const md = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
      const blocks = [...md.matchAll(/```typescript\n([\s\S]*?)```/g)].map((m) => m[1]);
      expect(blocks, `Expected 7 TS blocks in ${relPath}`).toHaveLength(7);

      // 1. Semi-continuous batch: batch in {0} U [10, 100]
      const semiActive = await runDocBlock<{ status: string; batch: number | null; isActive: number | null }>(
        blocks[0],
        `(m.constraint(expr\`\${batch} >= 4\`), m.objective(minimize(batch)), await m.solve(), { status: m.status, batch: batch.value, isActive: isActive.value })`
      );
      expect(semiActive.status).toBe("Optimal");
      expect(semiActive.isActive).toBe(1);
      expect(semiActive.batch).toBeCloseTo(10, 6);

      const semiZero = await runDocBlock<{ status: string; batch: number | null; isActive: number | null }>(
        blocks[0],
        `(m.objective(minimize(batch)), await m.solve(), { status: m.status, batch: batch.value, isActive: isActive.value })`
      );
      expect(semiZero.status).toBe("Optimal");
      expect(semiZero.isActive).toBe(0);
      expect(semiZero.batch).toBeCloseTo(0, 6);

      // 2. Minimal-perturbation rescheduling (Hamming distance)
      const stable = await runDocBlock<{ status: string; obj: number | null; vals: Array<number | null> }>(
        blocks[1],
        `(await m.solve(), { status: m.status, obj: m.objectiveValue, vals: x.map((v) => v.value) })`
      );
      expect(stable.status).toBe("Optimal");
      expect(stable.obj).toBeCloseTo(5, 6);
      expect(stable.vals[0]).toBe(1);
      expect(stable.vals[2]).toBe(1);
      expect(stable.vals[1]! + stable.vals[3]!).toBe(1);

      // 3. Binary product linearization: bothAB == xA * xB across all 4 binary assignments
      const binMax = await runDocBlock<{ status: string; obj: number | null; xA: number | null; xB: number | null; bothAB: number | null }>(
        blocks[2],
        `(await m.solve(), { status: m.status, obj: m.objectiveValue, xA: xA.value, xB: xB.value, bothAB: bothAB.value })`
      );
      expect(binMax.status).toBe("Optimal");
      expect(binMax.obj).toBeCloseTo(25, 6);
      expect(binMax.bothAB).toBeCloseTo(1, 6);

      for (const [aVal, bVal] of [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ] as const) {
        const fixed = await runDocBlock<number | null>(
          blocks[2],
          `(m.constraint(expr\`\${xA} == ${aVal}\`), m.constraint(expr\`\${xB} == ${bVal}\`), await m.solve(), bothAB.value)`
        );
        expect(fixed).toBeCloseTo(aVal * bVal, 6);
      }

      // 4. Min-Max load balancing: 60 hours across 3 workers -> maxHours = 20
      const minMax = await runDocBlock<{ status: string; maxHours: number | null; alice: number | null; bob: number | null; carol: number | null }>(
        blocks[3],
        `(await m.solve(), { status: m.status, maxHours: maxHours.value, alice: hours.Alice.value, bob: hours.Bob.value, carol: hours.Carol.value })`
      );
      expect(minMax.status).toBe("Optimal");
      expect(minMax.maxHours).toBeCloseTo(20, 6);
      expect(minMax.alice).toBeCloseTo(20, 6);
      expect(minMax.bob).toBeCloseTo(20, 6);
      expect(minMax.carol).toBeCloseTo(20, 6);

      // 5. Soft constraint with slack variable
      const soft = await runDocBlock<{ status: string; staff: number | null; shortage: number | null; obj: number | null }>(
        blocks[4],
        `({ status: m.status, staff: assignedStaff.value, shortage: shortage.value, obj: m.objectiveValue })`
      );
      expect(soft.status).toBe("Optimal");
      expect(soft.staff).toBe(4);
      expect(soft.shortage).toBeCloseTo(1, 6);
      expect(soft.obj).toBeCloseTo(1400, 6);

      // 6. Symmetry breaking: activating 2 of 4 trucks forces canonical prefix [1, 1, 0, 0]
      const sym = await runDocBlock<Array<number | null>>(
        blocks[5],
        `(m.constraint(expr\`sum(\${truckUsed}) == 2\`), await m.solve(), truckUsed.map((t) => t.value))`
      );
      expect(sym).toEqual([1, 1, 0, 0]);

      // 7. Lexicographic two-stage solve
      const lex = await runDocBlock<{ status: string; minCost: number; maxHours: number | null; alice: number | null; bob: number | null }>(
        blocks[6],
        `({ status: m.status, minCost, maxHours: maxHours.value, alice: hours.Alice.value, bob: hours.Bob.value })`
      );
      expect(lex.status).toBe("Optimal");
      expect(lex.minCost).toBeCloseTo(800, 6);
      expect(lex.maxHours).toBeCloseTo(20, 6);
      expect(lex.alice).toBeCloseTo(20, 6);
      expect(lex.bob).toBeCloseTo(20, 6);
    }

    // Verify all decomposition.md orchestrator snippets (CuttingStockMaster, Custom getDual Pricing, FacilityMaster, ManualBenders) across EN/JA/ZH
    for (const relPath of [
      "docs/guide/decomposition.md",
      "docs/ja/guide/decomposition.md",
      "docs/zh/guide/decomposition.md",
    ]) {
      const md = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
      const allBlocks = [...md.matchAll(/```typescript\n([\s\S]*?)```/g)].map((m) => m[1]);

      const cuttingBlock = allBlocks.find((b) => b.includes("CuttingStockMaster"));
      expect(cuttingBlock, `Missing CuttingStockMaster snippet in ${relPath}`).toBeDefined();
      const cgSubRes = await runDocBlock<{ status: string; obj: number | null; cols: number }>(
        cuttingBlock!.replace(/^\s*console\.log\([\s\S]*?\);\s*$/gm, ""),
        `({ status: result.status, obj: result.objectiveValue, cols: result.columnsAdded })`
      );
      expect(cgSubRes.status).toBe("Optimal");
      expect(cgSubRes.obj).toBeCloseTo(14, 5);
      expect(cgSubRes.cols).toBeGreaterThan(0);

      // Extract the RMP setup (before `const result = await master.solveColumnGeneration`) and run the custom `getDual` snippet against a fresh RMP
      const rmpSetup = cuttingBlock!.split("const result = await master.solveColumnGeneration")[0];
      const customPricingBlock = allBlocks.find((b) => b.includes("customResult"));
      expect(customPricingBlock, `Missing customResult getDual pricing snippet in ${relPath}`).toBeDefined();
      const cgCustomRes = await runDocBlock<{ status: string; obj: number | null; cols: number }>(
        `${rmpSetup}\n${customPricingBlock!}`,
        `({ status: customResult.status, obj: customResult.objectiveValue, cols: customResult.columnsAdded })`
      );
      expect(cgCustomRes.status).toBe("Optimal");
      expect(cgCustomRes.obj).toBeCloseTo(14, 5);
      expect(cgCustomRes.cols).toBeGreaterThan(0);

      const facilityBlock = allBlocks.find((b) => b.includes("FacilityMaster"));
      expect(facilityBlock, `Missing FacilityMaster snippet in ${relPath}`).toBeDefined();
      const facilityRes = await runDocBlock<{ status: string; obj: number | null; cuts: number }>(
        facilityBlock!.replace(/^\s*console\.log\([\s\S]*?\);\s*$/gm, ""),
        `({ status: result.status, obj: result.objectiveValue, cuts: result.cutsAdded })`
      );
      expect(facilityRes.status).toBe("Optimal");
      expect(facilityRes.obj).toBeCloseTo(390, 4);
      expect(facilityRes.cuts).toBeGreaterThan(0);

      const manualBlock = allBlocks.find((b) => b.includes("ManualBenders"));
      expect(manualBlock, `Missing ManualBenders snippet in ${relPath}`).toBeDefined();
      const bendersRes = await runDocBlock<{ status: string; obj: number | null; y: number; theta: number }>(
        manualBlock!.replace(/^\s*console\.log\([\s\S]*?\);\s*$/gm, ""),
        `({ status: result.status, obj: result.objectiveValue, y: result.values.y, theta: result.values.theta })`
      );
      expect(bendersRes.status).toBe("Optimal");
      expect(bendersRes.obj).toBeCloseTo(70, 5);
      expect(bendersRes.y).toBe(1);
      expect(bendersRes.theta).toBeCloseTo(30, 5);
    }
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
        /\.(constrain|optimize|setObjective|vars|constrs|getValues?|lessThanOrEqual|greaterThanOrEqual|equalTo)\b/
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
          return { model, x, y, c1: model.constraints.get("budget"), status };
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
        exercisesText: "Optimization N",
        exercisesLink: "/exercises/",
        sheepTitle: "Fluffy Sheep Pasture Enclosure",
      },
      {
        key: "ja",
        prefix: "/ja",
        homeFile: "docs/ja/index.md",
        showcaseFile: "docs/ja/showcase/index.md",
        gettingStartedText: "\u306F\u3058\u3081\u306B",
        gettingStartedLink: "/ja/getting-started/",
        showcaseText: "\u30B7\u30E7\u30FC\u30B1\u30FC\u30B9",
        showcaseLink: "/ja/showcase/",
        exercisesText: "N\u672C\u30CE\u30C3\u30AF",
        exercisesLink: "/exercises/?lang=ja",
        sheepTitle: "\u3082\u3075\u3082\u3075\u7F8A\u306E\u7267\u5834\u56F2\u3044",
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
        exercisesText: "N 题训练",
        exercisesLink: "/exercises/?lang=zh",
        sheepTitle: "毛茸茸绵羊的牧场围栏",
      },
    ] as const;

    for (const loc of expectedLocales) {
      const localeConfig = vpConfig.locales?.[loc.key];
      const nav = localeConfig?.themeConfig?.nav ?? [];
      expect(nav.map((item: { text: string; link: string }) => ({ text: item.text, link: item.link }))).toEqual([
        { text: loc.gettingStartedText, link: loc.gettingStartedLink },
        { text: loc.showcaseText, link: loc.showcaseLink },
        { text: loc.exercisesText, link: loc.exercisesLink },
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
      expect(actionTexts).toEqual([loc.gettingStartedText, loc.exercisesText, loc.showcaseText]);
      expect(actionLinks).toEqual([loc.gettingStartedLink, loc.exercisesLink, loc.showcaseLink]);

      const showcasePath = path.resolve(process.cwd(), loc.showcaseFile);
      expect(fs.existsSync(showcasePath), `Missing ${loc.showcaseFile}`).toBe(true);
      const showcaseRaw = fs.readFileSync(showcasePath, "utf-8");
      expect(showcaseRaw).toContain(loc.sheepTitle);

      const cardDivs = Array.from(
        showcaseRaw.matchAll(/<div\s+([^>]*\bclass="washi-showcase-card(?:\s+[^"]*)?"[^>]*)>/g),
        (m) => m[1]
      );
      expect(cardDivs).toHaveLength(7);

      const ctaAnchors = Array.from(
        showcaseRaw.matchAll(/<a\s+([^>]*class="washi-showcase-cta"[^>]*)>/g),
        (m) => m[1]
      );
      expect(ctaAnchors).toHaveLength(7);

      const thumbImgs = Array.from(
        showcaseRaw.matchAll(/<img\s+([^>]*class="washi-showcase-thumb-img"[^>]*)>/g),
        (m) => m[1]
      );
      expect(thumbImgs).toHaveLength(7);
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
      const langParam = loc.key === "root" ? "en" : loc.key;
      const expectedExercisesHref = loc.key === "root" ? "/exercises/" : `/exercises/?lang=${loc.key}`;
      expect(primaryHrefs).toEqual([
        "/demo/",
        expectedExercisesHref,
        "/apps/ai-shift/",
        "/apps/ai-timetable/",
        "/games/demon-castle-shift/",
        "/games/mofumofu-sheep/",
        "/games/titan-pack/",
      ]);
      const theoryHrefs = theoryAnchors.map((attrs) => {
        const hrefMatch = attrs.match(/\bhref="([^"]+)"/);
        expect(hrefMatch, `Missing href in showcase theory CTA <a ${attrs}>`).not.toBeNull();
        return hrefMatch![1];
      });
      expect(theoryHrefs).toEqual([
        `/apps/ai-timetable-theory/?lang=${langParam}`,
        `/games/demon-castle-shift-theory/?lang=${langParam}`,
        `/games/mofumofu-sheep-theory/?lang=${langParam}`,
        `/games/titan-pack-theory/?lang=${langParam}`,
      ]);

      for (const href of [...primaryHrefs, ...theoryHrefs]) {
        const cleanHref = href.split("?")[0];
        const subpath = cleanHref.replace(/^\//, "");
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
      "docs/.vitepress/theme/components/HeroCodeDemo.vue",
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
    expect(themeIndexRaw).toMatch(/demo\|apps\|games\|exercises/);

    const castleIndexRaw = fs.readFileSync(
      path.resolve(process.cwd(), "examples/web-demo/games/demon-castle-shift/index.html"),
      "utf-8"
    );
    expect(castleIndexRaw).toContain('id="title-back-link"');
    expect(castleIndexRaw).toContain('showcase');

    const sheepIndexRaw = fs.readFileSync(
      path.resolve(process.cwd(), "examples/web-demo/games/mofumofu-sheep/index.html"),
      "utf-8"
    );
    expect(sheepIndexRaw).toContain('id="back-link"');
    expect(sheepIndexRaw).toContain('showcase');

    const timetableIndexRaw = fs.readFileSync(
      path.resolve(process.cwd(), "examples/web-demo/apps/ai-timetable/index.html"),
      "utf-8"
    );
    expect(timetableIndexRaw).toContain('id="nav-link-apps"');
    expect(timetableIndexRaw).toContain('showcase');

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

  it("executes Getting Started quickstart and Guide constraints sum/dot snippets across EN, JA, and ZH", async () => {
    for (const relDoc of [
      "docs/getting-started/index.md",
      "docs/ja/getting-started/index.md",
      "docs/zh/getting-started/index.md",
    ]) {
      const md = fs.readFileSync(path.resolve(process.cwd(), relDoc), "utf-8");
      expect(md.match(/^## /gm)).toHaveLength(3);
      expect(md).not.toContain("Why TypeScript & WebAssembly");
      expect(md).not.toContain("\u306a\u305c TypeScript & WebAssembly");
      expect(md).not.toContain("\u4e3a\u4ec0\u4e48\u9009\u62e9 TypeScript");
      expect(md).not.toContain("ecosystem.md");
      expect(md).not.toContain("/ecosystem");
      expect(md).toContain("(./coding-agents.md)");
      expect(md).toContain("(../guide/variables.md)");
      const quickStartIdx = md.indexOf("```typescript");
      const nextStepsIdx = md.indexOf("## 🧭");
      expect(quickStartIdx).toBeGreaterThan(0);
      expect(nextStepsIdx).toBeGreaterThan(quickStartIdx);
      const optionalPeersBashMatch = md.match(/```bash\n(npm install z3-solver[\s\S]*?)```/);
      expect(optionalPeersBashMatch, `Missing optional solvers bash block in ${relDoc}`).not.toBeNull();
      expect(optionalPeersBashMatch![1]).not.toContain("npx skills add");
      const firstTsMatch = md.match(/```typescript\n([\s\S]*?)```/);
      expect(firstTsMatch, `Missing opening TypeScript snippet in ${relDoc}`).not.toBeNull();

      const jsBody = stripTypeScriptTypes(firstTsMatch![1]).replace(
        /^\s*import\s+\{[^}]+\}\s+from\s+["']@ohtaman\/washi["'];?\s*$/gm,
        ""
      );
      const logs: unknown[][] = [];
      const mockConsole = { log: (...args: unknown[]) => logs.push(args) };
      const runner = new Function(
        "Washi",
        "console",
        `const { Model, expr, maximize } = Washi;\nreturn (async () => {\n${jsBody}\nreturn { m, desks, chairs, status };\n})();`
      );
      const res = (await runner(Washi, mockConsole)) as {
        m: Washi.Model;
        desks: Washi.Var;
        chairs: Washi.Var;
        status: string;
      };
      expect(res.status).toBe("Optimal");
      expect(res.m.verify().valid).toBe(true);
      expect(res.m.objectiveValue).toBeCloseTo(1100, 6);
      expect(res.desks.value).toBeCloseTo(20, 6);
      expect(res.chairs.value).toBeCloseTo(10, 6);
      expect(logs[0]).toEqual(["Optimal", true]);
    }

    for (const relDoc of [
      "docs/guide/constraints.md",
      "docs/ja/guide/constraints.md",
      "docs/zh/guide/constraints.md",
    ]) {
      const md = fs.readFileSync(path.resolve(process.cwd(), relDoc), "utf-8");
      const aggMatch = md.match(/```typescript\n((?:(?!```)[\s\S])*?capacity_limit(?:(?!```)[\s\S])*?)```/);
      expect(aggMatch, `Missing sum/dot aggregation snippet in ${relDoc}`).not.toBeNull();

      const jsBody = stripTypeScriptTypes(aggMatch![1]).replace(
        /^\s*import\s+\{[^}]+\}\s+from\s+["']@ohtaman\/washi["'];?\s*$/gm,
        ""
      );
      const runner = new Function(
        "Washi",
        `const { Model, expr } = Washi;\n${jsBody}\nreturn m;`
      );
      const m = runner(Washi) as Washi.Model;
      expect(m.constraints.size).toBe(2);
      const lp = m.toLpString();
      expect(lp).toContain("max_items: A + B + C <= 2");
      expect(lp).toContain("capacity_limit: 5 A + 10 B + 15 C <= 25");
    }

    for (const relDoc of [
      "docs/getting-started/runtimes.md",
      "docs/ja/getting-started/runtimes.md",
      "docs/zh/getting-started/runtimes.md",
    ]) {
      const md = fs.readFileSync(path.resolve(process.cwd(), relDoc), "utf-8");
      expect(md).toContain("file://");
      expect(md).toContain('window.origin === "null"');
      expect(md).toContain("Tauri");
      expect(md).toContain("Capacitor");
      expect(md).toContain("PWA");
      expect(md).toContain("tauri.conf.json");
      expect(md).toContain("'wasm-unsafe-eval'");
    }
  });

  it("executes guide/constraint-programming.md snippets and examples/project-scheduling.md CodeRunner across EN, JA, and ZH", async () => {
    const runCpBlock = async <T>(tsSource: string, tailExpr: string): Promise<T> => {
      const stripped = stripTypeScriptTypes(tsSource)
        .replace(/^\s*import\s+[\s\S]*?from\s+["']@ohtaman\/washi["'];?\s*$/gm, "")
        .replace(/^\s*import\s+["']@ohtaman\/washi\/solvers\/pumpkin["'];?\s*$/gm, "");
      const fn = new Function(
        "Washi",
        `const { Model, expr, distinct, disjoint, cumulative, allowed, not, max, at, and, minimize } = Washi;\nreturn (async () => {\n${stripped}\nreturn ${tailExpr};\n})();`
      );
      return fn(Washi) as Promise<T>;
    };

    for (const relPath of [
      "docs/guide/constraint-programming.md",
      "docs/ja/guide/constraint-programming.md",
      "docs/zh/guide/constraint-programming.md",
    ]) {
      const md = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
      const blocks = [...md.matchAll(/```typescript\n([\s\S]*?)```/g)].map((m) => m[1]);
      expect(blocks, `Expected 3 TS blocks in ${relPath}`).toHaveLength(3);

      // Block 1: IntervalSchedulingCP -> Optimal makespan 12
      const sched = await runCpBlock<{ status: string; obj: number | null; valid: boolean }>(
        blocks[0],
        `({ status: m.status, obj: m.objectiveValue, valid: m.verify().valid })`
      );
      expect(sched.status).toBe("Optimal");
      expect(sched.obj).toBe(12);
      expect(sched.valid).toBe(true);

      // Block 2: MachineAssignmentCP -> Optimal cost 55, machine = { jobA: 1, jobB: 0, jobC: 2 }
      const assign = await runCpBlock<{
        status: string;
        obj: number | null;
        machine: { jobA: number | null; jobB: number | null; jobC: number | null };
        valid: boolean;
      }>(
        blocks[1],
        `({ status: m.status, obj: m.objectiveValue, machine: { jobA: machine.jobA.value, jobB: machine.jobB.value, jobC: machine.jobC.value }, valid: m.verify().valid })`
      );
      expect(assign.status).toBe("Optimal");
      expect(assign.obj).toBe(55);
      expect(assign.machine).toEqual({ jobA: 1, jobB: 0, jobC: 2 });
      expect(assign.valid).toBe(true);

      // Block 3: SymmetryBreakingCP -> Optimal cost 1270, slot = [1, 2, 3]
      const sym = await runCpBlock<{
        status: string;
        obj: number | null;
        slots: Array<number | null>;
        valid: boolean;
      }>(
        blocks[2],
        `({ status: m.status, obj: m.objectiveValue, slots: slot.map((s) => s.value), valid: m.verify().valid })`
      );
      expect(sym.status).toBe("Optimal");
      expect(sym.obj).toBe(1270);
      expect(sym.slots).toEqual([1, 2, 3]);
      expect(sym.valid).toBe(true);
    }

    resetSnippetRunnerStateForTests();
    for (const relPath of [
      "docs/examples/project-scheduling.md",
      "docs/ja/examples/project-scheduling.md",
      "docs/zh/examples/project-scheduling.md",
    ]) {
      const md = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
      const runnerMatch = md.match(/<CodeRunner[\s\S]*?>[\s\S]*?```typescript\n([\s\S]*?)```[\s\S]*?<\/CodeRunner>/);
      expect(runnerMatch, `Missing CodeRunner snippet in ${relPath}`).not.toBeNull();
      const res = await runWashiSnippet(runnerMatch![1]);
      expect(res.errorMsg, `CodeRunner execution failed in ${relPath}: ${res.errorMsg}`).toBeNull();
      const joined = res.logs.join("\n");
      expect(joined).toContain("Optimal");
      expect(joined).toContain("12");
      expect(joined).toContain("Unsat");
    }
    resetSnippetRunnerStateForTests();
  });
});
