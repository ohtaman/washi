import { describe, it, expect } from "vitest";
import {
  Model,
  c,
  expr,
  sum,
  not,
  QuadExpr,
  LpProblem,
  LpVariable,
  LpMaximize,
  LpInteger,
  HiGHS,
  value,
} from "../src/index.js";
import "../src/modeler/solvers/z3/index.js";
import "../src/modeler/solvers/glpk/index.js";

describe("README.md Code Snippets Validation", () => {
  it("executes Quick Look / 1. MIP production planning", async () => {
    const m = new Model({ sense: "Maximize" });
    const x = m.addVar({ type: "Integer", lb: 0 });
    const y = m.addVar({ type: "Integer", lb: 0 });

    m.maximize(expr`30 * ${x} + 50 * ${y}`);
    m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
    m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(x.value).toBe(20);
    expect(y.value).toBe(10);
  });

  it("executes Multidimensional Variables Grid (addVars)", () => {
    const m = new Model();

    // 1D dictionary of binary variables
    const openCity = m.addVars(["Tokyo", "Osaka", "Nagoya"], { type: "Binary" });
    expect(openCity["Tokyo"]).toBeDefined();
    expect(openCity["Tokyo"]?.type).toBe("Binary");

    // 2D transport flow matrix: [Factory] x [Store]
    const flow = m.addVars(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });
    expect(flow["F1"]["StoreA"]).toBeDefined();
    expect(flow["F1"]["StoreA"]?.lb).toBe(0);

    // 2D coordinate grid (e.g. 8x8 chessboard)
    const board = m.addVars(8, 8, { type: "Binary", prefix: "queen" });
    expect(board[0][0]).toBeDefined();
    expect(board[7][7]).toBeDefined();
  });

  it("executes Big-M Indicator Constraints (addIndicator)", async () => {
    const m = new Model();
    const openCity = m.addVars(["Tokyo", "Osaka"], { type: "Binary" });
    const flow = m.addVars(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0, ub: 500 });

    // If Tokyo is closed (0), flow to StoreA must be <= 0
    m.addIndicator(openCity["Tokyo"], flow["F1"]["StoreA"].le(0), {
      activeValue: 0,
      M: 1000,
    });

    // Close Tokyo factory
    m.addConstraint(openCity["Tokyo"].eq(0));
    m.maximize(flow["F1"]["StoreA"]);

    await m.solve();
    expect(flow["F1"]["StoreA"].value).toBeCloseTo(0);
  });

  it("executes 2. Portfolio Risk Minimization (Convex QP)", async () => {
    const m = new Model({ name: "MarkowitzPortfolio", sense: "Minimize" });
    const assets = ["Tech", "Bonds", "RealEstate"];
    const returns = [0.14, 0.04, 0.08];

    // Decision variables: portfolio allocation weights (0 to 1)
    const w = assets.map((a) => m.addVar({ name: `w_${a}`, lb: 0, ub: 1 }));

    // 1. Fully invested budget: sum(w) == 1.0
    m.addConstraint(sum(w).eq(1.0), "budget");

    // 2. Minimum target return: portfolio return >= 8.5%
    m.addConstraint(sum(w.map((v, i) => v.mul(returns[i]))).ge(0.085), "min_return");

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
        risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
      }
    }
    m.minimize(risk);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeGreaterThan(0);
    const totalAllocated = w.reduce((acc, v) => acc + (v.value || 0), 0);
    expect(totalAllocated).toBeCloseTo(1.0, 4);
  });

  it("executes 3. SMT Logic & Rule Engines (with Z3)", async () => {
    const m = new Model({ name: "SmartSecurityRules" });

    const isNight = m.addBoolVar("isNight");
    const motion = m.addBoolVar("motion");
    const alarm = m.addBoolVar("alarm");
    const siren = m.addBoolVar("siren");
    const lux = m.addVar({ name: "lux", type: "Integer", lb: 0 });

    // Logical rules
    m.addConstraint(lux.le(50).implies(isNight), "dark_implies_night");
    m.addConstraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

    // Current sensor observations
    m.addConstraint(lux.le(10), "sensor_dark");
    m.addConstraint(motion, "sensor_motion");
    m.addConstraint(alarm, "alarm_on");

    // Check satisfiability without objective
    const res = await m.check({ solver: "z3" });
    expect(res.status).toBe("Sat");
    expect(m.values.get("siren")).toBe(true);
  });

  it("executes 4. Conflict Diagnosis (unsatCore with Z3)", async () => {
    const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

    const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
    const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
    const rushDelivery = m.addBoolVar("rushDelivery");

    // Rule 1: Each engineer costs $8,000
    m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");

    // Rule 2: Customer requires rush delivery
    m.addConstraint(rushDelivery, "rush_required");

    // Rule 3: Rush delivery requires at least 8 engineers
    m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

    // Rule 4: Hard board budget cap of $50,000 (Conflict: 8 * $8000 = $64,000 > $50,000!)
    m.addConstraint(budget.le(50000), "strict_board_budget_cap");

    // Rule 5: Minimum 1 employee regulation (innocent bystander rule)
    m.addConstraint(engineers.ge(1), "minimum_one_employee");

    const res = await m.check({ solver: "z3" });
    expect(res.status).toBe("Unsat");
    expect(res.unsatCore).toBeDefined();
    expect(res.unsatCore).toContain("budget_limit");
    expect(res.unsatCore).toContain("rush_required");
    expect(res.unsatCore).toContain("rush_staffing_rule");
    expect(res.unsatCore).toContain("strict_board_budget_cap");
    expect(res.unsatCore).not.toContain("minimum_one_employee");
  });

  it("executes 5. Python PuLP Compatibility Layer", async () => {
    const prob = new LpProblem("PuLPDemo", LpMaximize);

    const x = new LpVariable("x", 0, undefined, LpInteger);
    const y = new LpVariable("y", 0, undefined, LpInteger);

    // PuLP += equivalent
    prob.add(x.mul(30).add(y.mul(50)));
    prob.add(x.add(y.mul(2)).le(40));
    prob.add(x.mul(2).add(y).le(50));

    const status = await prob.solve(new HiGHS());
    expect(status).toBe("Optimal");
    expect(value(prob.objective)).toBe(1100);
    expect(value(x)).toBe(20);
    expect(value(y)).toBe(10);
  });

  it("executes 5. Solving with GLPK (GPL-3.0)", async () => {
    const m = new Model({ sense: "Maximize", solver: "glpk" });
    const x = m.addVar({ type: "Integer", lb: 0 });
    const y = m.addVar({ type: "Integer", lb: 0 });

    m.maximize(expr`30 * ${x} + 50 * ${y}`);
    m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
    m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(x.value).toBe(20);
    expect(y.value).toBe(10);
  });
});
