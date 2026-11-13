import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EXAMPLES } from "../examples/web-demo/src/presets/index.js";
import {
  replaceSolverInCode,
  detectSolverInCode,
} from "../examples/web-demo/src/ui/app.js";
import { executeModelCode } from "../examples/web-demo/src/ui/runner.js";
import { registerGLPKSolver } from "../src/modeler/solvers/glpk.js";
import { registerZ3Solver, killZ3Threads } from "../src/modeler/solvers/z3.js";
import * as fs from "fs";
import * as path from "path";

describe("Playground Solver Synchronization & Code Updating", () => {
  it("every preset in EXAMPLES explicitly configures its solver in code", () => {
    for (const ex of EXAMPLES) {
      const solver = detectSolverInCode(ex.code);
      expect(
        solver,
        `Preset "${ex.id}" (${ex.title}) should have an explicit solver configured in its code`
      ).not.toBeNull();
      expect(["highs", "glpk", "z3"]).toContain(solver);
    }
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

  it("updates solver in new Model({ ... solver: 'highs' }) when changed to glpk or z3", () => {
    const originalCode = `const m = new Model({ name: "PortfolioOptimization", sense: "Minimize", solver: "highs" });
const status = await m.solve();`;

    const glpkCode = replaceSolverInCode(originalCode, "glpk");
    expect(glpkCode).toContain('solver: "glpk"');
    expect(glpkCode).not.toContain('solver: "highs"');
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
    const updated = replaceSolverInCode(rawCode, "glpk");
    expect(updated).toContain('solver: "glpk"');
    expect(detectSolverInCode(updated)).toBe("glpk");
  });

  it("adds solver to new Model('name') when no options were present", () => {
    const rawCode = `const m = new Model("PortfolioQP");`;
    const updated = replaceSolverInCode(rawCode, "z3");
    expect(updated).toContain('solver: "z3"');
    expect(detectSolverInCode(updated)).toBe("z3");
  });

  it("updates multiple solver references in SMT conflict diagnosis models", () => {
    const smtCode = `const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const res = await m.check({ solver: "z3" });`;

    const updated = replaceSolverInCode(smtCode, "highs");
    expect(updated).toContain('solver: "highs"');
    expect(updated).not.toContain('solver: "z3"');
    expect(detectSolverInCode(updated)).toBe("highs");
  });

  it("does not misdetect or overwrite comments mentioning solver options", () => {
    const codeWithComments = `// Tip: solver: "z3" can be used for SMT diagnosis
/* Note: solver: "glpk" is available for LP/MIP */
const m = new Model({ name: "DietProblem", sense: "Minimize", solver: "highs" });
const status = await m.solve();`;

    // Should detect "highs", not "z3" or "glpk" from comments
    expect(detectSolverInCode(codeWithComments)).toBe("highs");

    // When replaced with glpk, comments should remain intact
    const updated = replaceSolverInCode(codeWithComments, "glpk");
    expect(updated).toContain('// Tip: solver: "z3" can be used for SMT diagnosis');
    expect(updated).toContain('/* Note: solver: "glpk" is available for LP/MIP */');
    expect(updated).toContain('const m = new Model({ name: "DietProblem", sense: "Minimize", solver: "glpk" });');
    expect(detectSolverInCode(updated)).toBe("glpk");
  });
});

describe("Playground Typography (Mincho / Serif Removal)", () => {
  it("style.css does not assign serif fonts to brand or section headings", () => {
    const styleCssPath = path.resolve(__dirname, "../examples/web-demo/src/style.css");
    const content = fs.readFileSync(styleCssPath, "utf-8");

    // Headings and brand titles should not use var(--font-serif)
    expect(content).not.toMatch(/\.brand-title\s*\{[^}]*font-family:\s*var\(--font-serif\)/);
    expect(content).not.toMatch(/\.section-title\s*\{[^}]*font-family:\s*var\(--font-serif\)/);
    expect(content).not.toMatch(/\.docs-container\s+h2\s*\{[^}]*font-family:\s*var\(--font-serif\)/);
    expect(content).not.toMatch(/\.docs-section\s+h3\s*\{[^}]*font-family:\s*var\(--font-serif\)/);

    // --font-serif should not be set to Noto Serif JP
    expect(content).not.toMatch(/--font-serif:\s*['"]Noto Serif JP['"]/);
  });

  it("demo/index.html does not load Noto Serif JP", () => {
    const indexPath = path.resolve(__dirname, "../examples/web-demo/demo/index.html");
    const content = fs.readFileSync(indexPath, "utf-8");

    expect(content).not.toContain("Noto+Serif+JP");
    expect(content).toContain("Noto+Sans+JP");
  });
});

describe("Playground Presets Runtime Execution", () => {
  beforeAll(() => {
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
        expect(m.validateSolution().valid).toBe(true);
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
        expect(m.validateSolution().valid).toBe(true);
      } else if (ex.id === "smt_sat_scheduling") {
        expect(m.status).toBe("Sat");
        expect(m.validateSolution().valid).toBe(true);
      } else {
        throw new Error(`Unhandled preset id "${ex.id}" in runtime execution suite`);
      }
    }, 30000);
  }
});
