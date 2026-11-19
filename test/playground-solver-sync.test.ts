import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EXAMPLES } from "../examples/web-demo/src/presets/index.js";
import {
  replaceSolverInCode,
  detectSolverInCode,
} from "../examples/web-demo/src/ui/app.js";
import { executeModelCode } from "../examples/web-demo/src/ui/runner.js";
import { registerGLPKSolver } from "../src/modeler/solvers/glpk.js";
import { registerPumpkinSolver } from "../src/modeler/solvers/pumpkin.js";
import { registerZ3Solver, killZ3Threads } from "../src/modeler/solvers/z3.js";
import * as fs from "fs";
import * as path from "path";

describe("Playground Solver Synchronization & Code Updating", () => {
  it("every preset in EXAMPLES explicitly configures its solver in code", () => {
    const detectedSolvers = new Set<string>();
    for (const ex of EXAMPLES) {
      const solver = detectSolverInCode(ex.code);
      expect(
        solver,
        `Preset "${ex.id}" (${ex.title}) should have an explicit solver configured in its code`
      ).not.toBeNull();
      expect(["highs", "pumpkin", "glpk", "z3"]).toContain(solver);
      if (solver) detectedSolvers.add(solver);
    }
    expect(detectedSolvers.has("pumpkin")).toBe(true);
  });

  it("every preset in EXAMPLES has a localized title and description in en, ja, and zh locales", () => {
    for (const loc of ["en", "ja", "zh"]) {
      const localePath = path.resolve(
        __dirname,
        `../examples/web-demo/src/locales/${loc}.json`
      );
      const localeData = JSON.parse(fs.readFileSync(localePath, "utf-8"));
      for (const ex of EXAMPLES) {
        expect(
          localeData.presets?.[ex.id]?.title,
          `Missing presets.${ex.id}.title in ${loc}.json`
        ).toBeTruthy();
        expect(
          localeData.presets?.[ex.id]?.description,
          `Missing presets.${ex.id}.description in ${loc}.json`
        ).toBeTruthy();
      }
      expect(
        localeData.docsHtml,
        `${loc}.json docsHtml should not contain literal backslash-escaped template syntax`
      ).not.toContain("\\`");
      expect(
        localeData.docsHtml,
        `${loc}.json docsHtml should not contain literal backslash-escaped interpolations`
      ).not.toContain("\\${");
      expect(localeData.docsHtml).toContain("<code>expr`sum(${x})`</code>");
      expect(localeData.docsHtml).toContain("<code>expr`dot(${costs}, ${x})`</code>");
    }
  });

  it("updates solver in new Model({ ... solver: 'highs' }) when changed to pumpkin, glpk, or z3", () => {
    const originalCode = `const m = new Model({ name: "PortfolioOptimization", sense: "Minimize", solver: "highs" });
const status = await m.solve();`;

    const pumpkinCode = replaceSolverInCode(originalCode, "pumpkin");
    expect(pumpkinCode).toContain('solver: "pumpkin"');
    expect(pumpkinCode).not.toContain('solver: "highs"');
    expect(detectSolverInCode(pumpkinCode)).toBe("pumpkin");

    const glpkCode = replaceSolverInCode(pumpkinCode, "glpk");
    expect(glpkCode).toContain('solver: "glpk"');
    expect(glpkCode).not.toContain('solver: "pumpkin"');
    expect(detectSolverInCode(glpkCode)).toBe("glpk");

    const z3Code = replaceSolverInCode(glpkCode, "z3");
    expect(z3Code).toContain('solver: "z3"');
    expect(z3Code).not.toContain('solver: "glpk"');
    expect(detectSolverInCode(z3Code)).toBe("z3");

    const highsCode = replaceSolverInCode(z3Code, "highs");
    expect(highsCode).toContain('solver: "highs"');
    expect(detectSolverInCode(highsCode)).toBe("highs");
  });

  it("adds solver to new Model({ ... }) when no solver property was present", () => {
    const rawCode = `const m = new Model({ name: "Demo", sense: "Maximize" });`;
    const updatedGlpk = replaceSolverInCode(rawCode, "glpk");
    expect(updatedGlpk).toContain('solver: "glpk"');
    expect(detectSolverInCode(updatedGlpk)).toBe("glpk");

    const updatedPumpkin = replaceSolverInCode(rawCode, "pumpkin");
    expect(updatedPumpkin).toContain('solver: "pumpkin"');
    expect(detectSolverInCode(updatedPumpkin)).toBe("pumpkin");
  });

  it("adds solver to new Model('name') when no options were present", () => {
    const rawCode = `const m = new Model("PortfolioQP");`;
    const updatedZ3 = replaceSolverInCode(rawCode, "z3");
    expect(updatedZ3).toContain('solver: "z3"');
    expect(detectSolverInCode(updatedZ3)).toBe("z3");

    const updatedPumpkin = replaceSolverInCode(`const m = new Model("Demo");`, "pumpkin");
    expect(updatedPumpkin).toContain('solver: "pumpkin"');
    expect(detectSolverInCode(updatedPumpkin)).toBe("pumpkin");
  });

  it("updates multiple solver references in SMT and CP conflict diagnosis models", () => {
    const smtCode = `const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const res = await m.check({ solver: "z3" });`;

    const updatedPumpkin = replaceSolverInCode(smtCode, "pumpkin");
    expect(updatedPumpkin).toContain('new Model({ name: "ConflictDiagnosis", solver: "pumpkin" })');
    expect(updatedPumpkin).toContain('await m.check({ solver: "pumpkin" })');
    expect(updatedPumpkin).not.toContain('solver: "z3"');
    expect(detectSolverInCode(updatedPumpkin)).toBe("pumpkin");

    const updatedHighs = replaceSolverInCode(updatedPumpkin, "highs");
    expect(updatedHighs).toContain('new Model({ name: "ConflictDiagnosis", solver: "highs" })');
    expect(updatedHighs).toContain('await m.check({ solver: "highs" })');
    expect(updatedHighs).not.toContain('solver: "pumpkin"');
    expect(detectSolverInCode(updatedHighs)).toBe("highs");
  });

  it("does not misdetect or overwrite comments mentioning solver options", () => {
    const codeWithComments = `// Tip: solver: "z3" or solver: "pumpkin" can be used for conflict diagnosis
/* Note: solver: "glpk" is available for LP/MIP and solver: "pumpkin" for CP */
const m = new Model({ name: "DietProblem", sense: "Minimize", solver: "highs" });
const status = await m.solve();`;

    // Should detect "highs", not "z3", "pumpkin", or "glpk" from comments
    expect(detectSolverInCode(codeWithComments)).toBe("highs");

    // When replaced with pumpkin or glpk, comments should remain intact
    const updatedPumpkin = replaceSolverInCode(codeWithComments, "pumpkin");
    expect(updatedPumpkin).toContain('// Tip: solver: "z3" or solver: "pumpkin" can be used for conflict diagnosis');
    expect(updatedPumpkin).toContain('/* Note: solver: "glpk" is available for LP/MIP and solver: "pumpkin" for CP */');
    expect(updatedPumpkin).toContain('const m = new Model({ name: "DietProblem", sense: "Minimize", solver: "pumpkin" });');
    expect(detectSolverInCode(updatedPumpkin)).toBe("pumpkin");

    const updatedGlpk = replaceSolverInCode(updatedPumpkin, "glpk");
    expect(updatedGlpk).toContain('const m = new Model({ name: "DietProblem", sense: "Minimize", solver: "glpk" });');
    expect(detectSolverInCode(updatedGlpk)).toBe("glpk");
  });

  it("exposes Pumpkin and accessible select labels in demo/index.html", () => {
    const demoHtmlPath = path.resolve(__dirname, "../examples/web-demo/demo/index.html");
    const html = fs.readFileSync(demoHtmlPath, "utf-8");

    expect(html).toContain('<option value="highs" selected>');
    expect(html).toContain('<option value="pumpkin">');
    expect(html).toContain('<option value="glpk">');
    expect(html).toContain('<option value="z3">');

    expect(html).toMatch(/<label[^>]*for="preset-select"/);
    expect(html).toMatch(/<label[^>]*for="solver-select"/);
    expect(html).not.toContain('aria-label="Problem Model Selector"');
    expect(html).not.toContain('aria-label="Solver Engine Selector"');
  });
});

describe("Playground Presets Runtime Execution", () => {
  beforeAll(() => {
    registerPumpkinSolver();
    registerGLPKSolver();
    registerZ3Solver();
  });

  afterAll(async () => {
    await killZ3Threads();
  });

  const expectedObjectives: Record<string, number> = {
    production: 2200,
    cloud_sizing: 140,
    knapsack: 120,
    transportation: 880,
    diet_sensitivity: 24652 / 1805,
    shift_scheduling: 3830,
    cart_coupon: 192,
    portfolio_qp: 0.014229,
    glpk_diet_problem: 206 / 13,
    project_scheduling: 12,
  };

  for (const ex of EXAMPLES) {
    it(`executes preset "${ex.id}" cleanly and satisfies mathematical invariants`, async () => {
      const res = await executeModelCode(ex.code);
      expect(res.error, `Preset "${ex.id}" threw error: ${res.error}`).toBeUndefined();
      expect(res.success).toBe(true);
      expect(res.model).toBeDefined();
      const m = res.model!;

      if (ex.id in expectedObjectives) {
        expect(m.status).toBe("Optimal");
        expect(m.objectiveValue).not.toBeNull();
        expect(m.objectiveValue!).toBeCloseTo(expectedObjectives[ex.id], 4);
        expect(m.verify().valid).toBe(true);
      } else if (ex.id === "project_conflict_unsat") {
        expect(m.status).toBe("Unsat");
        expect(m.unsatCore).toEqual(
          expect.arrayContaining([
            "rig_maintenance_window",
            "rush_ship_deadline",
            "single_rig",
          ])
        );
        expect(m.conflicts).toEqual(m.unsatCore);
        expect(m.unsatCore).not.toContain("crew_limit");
      } else if (ex.id === "shift_conflict_unsat") {
        expect(m.status).toBe("Unsat");
        expect(m.conflicts).toEqual(
          expect.arrayContaining([
            "coverage_Sat",
            "day_off_Alice_Sat",
            "day_off_Bob_Sat",
            "day_off_Charlie_Sat",
          ])
        );
        expect(m.conflicts).not.toContain("day_off_Diana_Fri");
      } else if (ex.id === "conflict_diagnosis_unsat") {
        expect(m.status).toBe("Unsat");
        expect(m.conflicts).toEqual(
          expect.arrayContaining([
            "budget_limit",
            "rush_required",
            "rush_staffing_rule",
            "strict_board_budget_cap",
          ])
        );
        expect(m.conflicts).not.toContain("minimum_one_employee");
      } else if (ex.id === "smt_security") {
        expect(m.status).toBe("Sat");
        expect(m.values.get("sirenActive")).toBe(true);
        expect(m.values.get("lightsOn")).toBe(true);
        expect(m.values.get("frontDoorUnlocked")).toBe(false);
        expect(m.values.get("isNight")).toBe(true);
        expect(m.verify().valid).toBe(true);
      } else if (ex.id === "smt_sat_scheduling") {
        expect(m.status).toBe("Sat");
        expect(m.verify().valid).toBe(true);
      } else {
        throw new Error(`Unhandled preset id "${ex.id}" in runtime execution suite`);
      }
    }, 30000);
  }

  it("exposes PumpkinSolver directly in the Playground execution scope", async () => {
    const code = `
      const m = new Model("DirectClass", { solver: new PumpkinSolver() });
      const x = m.integer("x", { lb: 1, ub: 5 });
      const y = m.integer("y", { lb: 1, ub: 5 });
      m.constraint(distinct([x, y]), "diff");
      m.objective(minimize(expr\`\${x} + \${y}\`));
      await m.solve();
    `;
    const res = await executeModelCode(code);
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);
    expect(res.model?.status).toBe("Optimal");
    expect(res.model?.objectiveValue).toBe(3);
  });

  it("executes project_scheduling and project_conflict_unsat across all 4 Playground solvers", async () => {
    const schedEx = EXAMPLES.find((e) => e.id === "project_scheduling")!;
    const conflictEx = EXAMPLES.find((e) => e.id === "project_conflict_unsat")!;

    for (const solver of ["pumpkin", "highs", "glpk", "z3"] as const) {
      const schedRes = await executeModelCode(replaceSolverInCode(schedEx.code, solver));
      expect(schedRes.error, `project_scheduling with ${solver}: ${schedRes.error}`).toBeUndefined();
      expect(schedRes.success).toBe(true);
      expect(schedRes.model?.status).toBe("Optimal");
      expect(schedRes.model?.objectiveValue).toBeCloseTo(12, 4);
      expect(schedRes.model?.verify().valid).toBe(true);

      const conflictRes = await executeModelCode(replaceSolverInCode(conflictEx.code, solver));
      expect(conflictRes.error, `project_conflict_unsat with ${solver}: ${conflictRes.error}`).toBeUndefined();
      expect(conflictRes.success).toBe(true);
      expect(conflictRes.model?.status).toBe("Unsat");
      expect((conflictRes.model?.conflicts?.length ?? 0)).toBeGreaterThan(0);
      expect(
        conflictRes.logs.some((l) => l.includes("\u2022 ")),
        `Expected bulleted conflict log line for project_conflict_unsat with ${solver}`
      ).toBe(true);
    }
  }, 60000);
});
