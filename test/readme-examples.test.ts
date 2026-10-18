import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Model, expr, sum, dot, not, QuadExpr, HiGHS, maximize, minimize } from "../src/index.js";
import "../src/modeler/solvers/z3/index.js";
import "../src/modeler/solvers/glpk/index.js";

describe("README.md Code Snippets Validation", () => {
  it("executes Quick Look / 1. MIP production planning", async () => {
    const m = new Model("FactoryPlanning");
    const chairs = m.integer("chairs", { lb: 0 });
    const tables = m.integer("tables", { lb: 0 });

    m.objective(maximize(expr`30 * ${chairs} + 50 * ${tables}`));
    m.constraint(expr`${chairs} + 2 * ${tables} <= 40`, "wood_limit");
    m.constraint(expr`2 * ${chairs} + ${tables} <= 50`, "labor_limit");

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(chairs.value).toBe(20);
    expect(tables.value).toBe(10);
  });

  it("executes Multidimensional Variables Grid", () => {
    const m = new Model();

    // 1D dictionary of binary variables
    const openCity = m.binary(["Tokyo", "Osaka", "Nagoya"]);
    expect(openCity["Tokyo"]).toBeDefined();
    expect(openCity["Tokyo"]?.type).toBe("Binary");

    // 2D transport flow matrix: [Factory] x [Store]
    const flow = m.continuous(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });
    expect(flow["F1"]["StoreA"]).toBeDefined();
    expect(flow["F1"]["StoreA"]?.lb).toBe(0);

    // 2D coordinate grid (e.g. 8x8 chessboard)
    const board = m.binary(8, 8, { prefix: "queen" });
    expect(board[0][0]).toBeDefined();
    expect(board[7][7]).toBeDefined();
  });

  it("executes Big-M Indicator Constraints (indicator)", async () => {
    const m = new Model();
    const openCity = m.binary(["Tokyo", "Osaka"]);
    const flow = m.continuous(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0, ub: 500 });

    // If Tokyo is closed (0), flow to StoreA must be <= 0
    m.indicator(openCity["Tokyo"], expr`${flow["F1"]["StoreA"]} <= 0`, {
      activeValue: 0,
      M: 1000,
    });

    // Close Tokyo factory
    m.constraint(expr`${openCity["Tokyo"]} == 0`);
    m.objective(maximize(flow["F1"]["StoreA"]));

    await m.solve();
    expect(flow["F1"]["StoreA"].value).toBeCloseTo(0);

    // Also verify automatic Big-M derivation + onProgress/AbortSignal + validateSolution() from README Section 1
    const m2 = new Model("FacilityPlanning");
    const openCity2 = m2.binary(["Tokyo", "Osaka", "Nagoya"]);
    const flow2 = m2.continuous(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0, ub: 1000 });
    m2.binary(8, 8, { prefix: "queen" });
    m2.indicator(openCity2["Tokyo"], expr`${flow2["F1"]["StoreA"]} <= 0`, {
      activeValue: 0,
      name: "tokyo_closed_no_flow",
    });
    const controller = new AbortController();
    await m2.solve({
      signal: controller.signal,
      onProgress: () => {},
    });
    const report = m2.validateSolution();
    expect(report.valid).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("executes 2. Portfolio Risk Minimization (Convex QP)", async () => {
    const m = new Model("MarkowitzPortfolio");
    const assets = ["Tech", "Bonds", "RealEstate"];
    const returns = [0.14, 0.04, 0.08];

    // Decision variables: portfolio allocation weights (0 to 1)
    const w = m.continuous(assets, { lb: 0, ub: 1 });

    // 1. Fully invested budget: sum(w) == 1.0
    m.constraint(expr`${sum(assets, (a) => w[a])} == 1.0`, "budget");

    // 2. Minimum target return: portfolio return >= 8.5%
    const retMap = Object.fromEntries(assets.map((a, i) => [a, returns[i]]));
    m.constraint(expr`${dot(retMap, w)} >= 0.085`, "min_return");

    // 3. Covariance risk matrix
    const cov = [
      [0.040, 0.002, 0.015],
      [0.002, 0.005, 0.002],
      [0.015, 0.002, 0.025],
    ];

    // Quadratic objective: w^T * Cov * w
    let risk = new QuadExpr();
    for (let i = 0; i < assets.length; i++) {
      for (let j = 0; j < assets.length; j++) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
    m.objective(minimize(risk));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeGreaterThan(0);
    const totalAllocated = assets.reduce((acc, a) => acc + (w[a].value || 0), 0);
    expect(totalAllocated).toBeCloseTo(1.0, 4);
  });

  it("executes 3. SMT Logic & Rule Engines (with Z3)", async () => {
    const m = new Model({ name: "SmartSecurityRules" });

    const isNight = m.bool("isNight");
    const motion = m.bool("motion");
    const alarm = m.bool("alarm");
    const siren = m.bool("siren");
    const lux = m.integer("lux", { lb: 0 });

    // Logical rules
    m.constraint(lux.le(50).implies(isNight), "dark_implies_night");
    m.constraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

    // Current sensor observations
    m.constraint(expr`${lux} <= 10`, "sensor_dark");
    m.constraint(motion, "sensor_motion");
    m.constraint(alarm, "alarm_on");

    // Check satisfiability without objective
    const res = await m.check({ solver: "z3" });
    expect(res.status).toBe("Sat");
    expect(m.values.get("siren")).toBe(true);
  });

  it("executes 4. Conflict Diagnosis (unsatCore with Z3)", async () => {
    const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

    const engineers = m.integer("engineers", { lb: 0, ub: 20 });
    const budget = m.continuous("budget", { lb: 0, ub: 100000 });
    const rushDelivery = m.bool("rushDelivery");

    // Rule 1: Each engineer costs $8,000
    m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

    // Rule 2: Customer requires rush delivery
    m.constraint(rushDelivery, "rush_required");

    // Rule 3: Rush delivery requires at least 8 engineers
    m.constraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

    // Rule 4: Hard board budget cap of $50,000 (Conflict: 8 * $8000 = $64,000 > $50,000!)
    m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

    // Rule 5: Minimum 1 employee regulation (innocent bystander rule)
    m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

    const res = await m.check({ solver: "z3" });
    expect(res.status).toBe("Unsat");
    expect(res.unsatCore).toBeDefined();
    expect(res.unsatCore).toContain("budget_limit");
    expect(res.unsatCore).toContain("rush_required");
    expect(res.unsatCore).toContain("rush_staffing_rule");
    expect(res.unsatCore).toContain("strict_board_budget_cap");
    expect(res.unsatCore).not.toContain("minimum_one_employee");
  });

  it("executes 5. Domain-Pure Algebraic Modeling", async () => {
    const m = new Model("ProductionDemo");

    const x = m.integer("x", { lb: 0 });
    const y = m.integer("y", { lb: 0 });

    m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
    m.constraint(expr`${x} + 2 * ${y} <= 40`);
    m.constraint(expr`2 * ${x} + ${y} <= 50`);

    const status = await m.solve(new HiGHS());
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(x.value).toBe(20);
    expect(y.value).toBe(10);
  });

  it("executes 6. Solving with GLPK (GPL-3.0)", async () => {
    const m = new Model({ solver: "glpk" });
    const x = m.integer("x", { lb: 0 });
    const y = m.integer("y", { lb: 0 });

    m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
    m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
    m.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_limit");

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(x.value).toBe(20);
    expect(y.value).toBe(10);
  });

  it("executes Hybrid SMT + MIP workflow (contradictory halt & feasible solve)", async () => {
    // Helper replicating the 07-hybrid-smt-mip pipeline logic
    async function runHybrid(forceConflict: boolean) {
      const policyModel = new Model({ name: "PolicyModel", solver: "z3" });
      const deployEurope = policyModel.bool("deployEurope");
      const deployUS = policyModel.bool("deployUS");
      const complianceGDPR = policyModel.bool("complianceGDPR");
      const budgetTierHigh = policyModel.bool("budgetTierHigh");

      policyModel.constraint(deployEurope.implies(complianceGDPR), "r1_gdpr");
      policyModel.constraint(deployEurope.and(deployUS).implies(budgetTierHigh), "r2_budget");
      policyModel.constraint(deployEurope).constraint(deployUS).constraint(complianceGDPR);

      if (forceConflict) {
        policyModel.constraint(budgetTierHigh.not(), "r3_low_budget_cap");
      } else {
        policyModel.constraint(budgetTierHigh, "r3_high_budget_approved");
      }

      const checkRes = await policyModel.check();
      if (checkRes.status !== "Sat") {
        return { halted: true, status: checkRes.status, mipStatus: null };
      }

      const mip = new Model("CapacityAllocation");
      const capEU = mip.continuous("capEU", { lb: 0, ub: 500 });
      const capUS = mip.continuous("capUS", { lb: 0, ub: 500 });
      const openEU = mip.binary("openEU");
      const openUS = mip.binary("openUS");

      // Carry over SMT-verified deployment decisions into MIP (Issue #34)
      if (deployEurope.value ?? true) {
        mip.constraint(openEU.eq(1), "enforce_eu_deployment");
      }
      if (deployUS.value ?? true) {
        mip.constraint(openUS.eq(1), "enforce_us_deployment");
      }

      mip.indicator(openEU, capEU.le(0), { activeValue: 0, M: 500 });
      mip.indicator(openUS, capUS.le(0), { activeValue: 0, M: 500 });
      mip.indicator(openEU, capEU.ge(50), { activeValue: 1, M: 500 });
      mip.indicator(openUS, capUS.ge(50), { activeValue: 1, M: 500 });
      mip.constraint(expr`${capEU} + ${capUS} >= 450`);
      mip.objective(minimize(expr`5000 * ${openEU} + 5000 * ${openUS} + 18 * ${capEU} + 12 * ${capUS}`));

      const mipStatus = await mip.solve();
      return {
        halted: false,
        status: checkRes.status,
        mipStatus,
        openEU: openEU.value,
        openUS: openUS.value,
        totalCost: mip.objectiveValue,
      };
    }

    // 1. Contradictory scenario must halt on Unsat and NOT run MIP
    const resConflict = await runHybrid(true);
    expect(resConflict.halted).toBe(true);
    expect(resConflict.status).toBe("Unsat");
    expect(resConflict.mipStatus).toBeNull();

    // 2. Feasible scenario must proceed and solve MIP optimally with both regions online
    const resFeasible = await runHybrid(false);
    expect(resFeasible.halted).toBe(false);
    expect(resFeasible.status).toBe("Sat");
    expect(resFeasible.mipStatus).toBe("Optimal");
    expect(resFeasible.openEU).toBe(1);
    expect(resFeasible.openUS).toBe(1);
    expect(resFeasible.totalCost).toBe(15700);
  });

  it("verifies pre-built browser distribution (dist/browser/washi.min.js) exports the modern API and executes the browser demo", () => {
    const minJsPath = path.resolve(process.cwd(), "dist/browser/washi.min.js");
    if (!fs.existsSync(minJsPath)) return;
    const code = fs.readFileSync(minJsPath, "utf-8");
    const WashiGlobal = new Function(code + "; return Washi;")();

    expect(typeof WashiGlobal.maximize).toBe("function");
    expect(typeof WashiGlobal.minimize).toBe("function");
    expect(typeof WashiGlobal.Model.prototype.objective).toBe("function");
    expect(typeof WashiGlobal.Model.prototype.constraint).toBe("function");

    // Execute the exact snippet from runtimes.md
    const { Model: BrowserModel, expr: browserExpr, maximize: browserMaximize } = WashiGlobal;
    const m = new BrowserModel("BrowserDemo");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 20 });
    m.objective(browserMaximize(browserExpr`2 * ${x} + 3 * ${y}`));
    m.constraint(browserExpr`${x} + ${y} <= 15`);
    expect(m.numConstrs).toBe(1);
  });

  it("links to the online documentation and valid relative docs/ files across README.md, README.ja.md, and README.zh-CN.md", () => {
    const expectations = [
      { file: "README.md", docsUrl: "https://ohtaman.github.io/washi/" },
      { file: "README.ja.md", docsUrl: "https://ohtaman.github.io/washi/ja/" },
      { file: "README.zh-CN.md", docsUrl: "https://ohtaman.github.io/washi/zh/" },
    ];

    for (const { file, docsUrl } of expectations) {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf-8");
      expect(content).toContain(`](${docsUrl})`);

      const relativeDocRegex = /\]\((docs\/[^)#\s]+)\)/g;
      let match: RegExpExecArray | null;
      const matchedPaths: string[] = [];
      while ((match = relativeDocRegex.exec(content)) !== null) {
        const relPath = match[1];
        matchedPaths.push(relPath);
        const absPath = path.resolve(process.cwd(), relPath);
        expect(
          fs.existsSync(absPath),
          `Expected relative doc path '${relPath}' in ${file} to exist`
        ).toBe(true);
      }
      expect(matchedPaths.length).toBeGreaterThanOrEqual(10);
    }
  });
});

