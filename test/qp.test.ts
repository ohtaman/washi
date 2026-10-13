import { describe, it, expect } from "vitest";
import { Model, expr, c } from "../src/index.js";
import { generateLpString } from "../src/modeler/lp-writer.js";
import { HiGHS } from "../src/modeler/solvers/highs.js";

describe("Quadratic Programming (QP) with HiGHS", () => {
  it("generates CPLEX LP format with quadratic objective [ ... ] / 2", () => {
    const m = new Model("TestQP");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // min 3x + x^2 + y^2
    m.minimize(x.mul(3).add(x.mul(x)).add(y.mul(y)));
    m.constrain(x.add(y).ge(4), "c1");

    const { lpString } = generateLpString({
      name: m.name,
      sense: m.sense,
      objective: m.objective(),
      constraints: m.constraints,
      variables: m.variables,
    });

    expect(lpString).toContain("Minimize");
    // Should have linear term 3 x and quadratic terms inside [ ... ] / 2
    expect(lpString).toMatch(/\[\s*2\s+x\s*\^\s*2\s*\+\s*2\s+y\s*\^\s*2\s*\]\s*\/\s*2/);
    expect(lpString).toContain("c1: x + y >= 4");
  });

  it("solves a constrained convex quadratic optimization problem", async () => {
    const m = new Model("ConvexQP");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // min 3x + x^2 + y^2 subject to x + y >= 4, x >= 0, y >= 0
    // Analytical optimum: x = 1.25, y = 2.75, obj = 12.875
    m.minimize(x.mul(3).add(x.mul(x)).add(y.mul(y)));
    m.constrain(x.add(y).ge(4), "sum_ge_4");

    const status = await m.solve(HiGHS);

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(1.25, 4);
    expect(y.value).toBeCloseTo(2.75, 4);
    expect(m.objectiveValue).toBeCloseTo(12.875, 4);
  });

  it("solves Markowitz Portfolio Optimization (2 assets with covariance)", async () => {
    const m = new Model("PortfolioQP");
    const w1 = m.continuous("w1", { lb: 0, ub: 1 });
    const w2 = m.continuous("w2", { lb: 0, ub: 1 });

    // Sum of weights = 1.0 (100% investment)
    m.constrain(w1.add(w2).eq(1), "budget");

    // Target expected return >= 14%
    // Asset 1 return = 10%, Asset 2 return = 20%
    m.constrain(w1.mul(0.10).add(w2.mul(0.20)).ge(0.14), "target_return");

    // Portfolio variance:
    // Var = sigma1^2 * w1^2 + 2 * cov12 * w1 * w2 + sigma2^2 * w2^2
    // Asset 1 risk: sigma1^2 = 0.04
    // Asset 2 risk: sigma2^2 = 0.16
    // Covariance: cov12 = 0.02
    const variance = w1.mul(w1).mul(0.04)
      .add(w1.mul(w2).mul(2 * 0.02))
      .add(w2.mul(w2).mul(0.16));

    m.minimize(variance);

    const status = await m.solve(HiGHS);

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(w1.value).not.toBeNull();
    expect(w2.value).not.toBeNull();
    // Budget satisfied
    expect(w1.value! + w2.value!).toBeCloseTo(1.0, 5);
    // Target return satisfied: 0.10*w1 + 0.20*w2 >= 0.14
    const achievedReturn = 0.10 * w1.value! + 0.20 * w2.value!;
    expect(achievedReturn).toBeGreaterThanOrEqual(0.1399);
    // Variance objective is positive and minimal
    expect(m.objectiveValue).toBeGreaterThan(0);
  });

  it("solves QP formulated cleanly using expr`...` syntax", async () => {
    const m = new Model("ExprQP");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // min 3x + x^2 + y^2 subject to x + y >= 4, x >= 0, y >= 0
    // Analytical optimum: x = 1.25, y = 2.75, obj = 12.875
    m.minimize(expr`3 * ${x} + ${x}^2 + ${y}^2`);
    m.constrain(expr`${x} + ${y} >= 4`);

    const status = await m.solve(HiGHS);

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(1.25, 4);
    expect(y.value).toBeCloseTo(2.75, 4);
    expect(m.objectiveValue).toBeCloseTo(12.875, 4);
  });

  it("solves QP with implicit coefficient in objective: min 2 x^2 - 4 x", async () => {
    const m = new Model("ImplicitCoeffQP");
    const x = m.continuous("x", { lb: 0, ub: 10 });

    // min 2 x^2 - 4 x. Optimum at x = 1, objective = -2
    m.minimize("2 x^2 - 4 x");

    const status = await m.solve(HiGHS);

    expect(status).toBe("Optimal");
    expect(x.value).toBeCloseTo(1.0, 4);
    expect(m.objectiveValue).toBeCloseTo(-2.0, 4);

    // Also verify tagged template literal expr`2 ${x2}^2 - 4 * ${x2}`
    const m2 = new Model("ExprImplicitCoeffQP");
    const x2 = m2.continuous("x", { lb: 0, ub: 10 });
    m2.minimize(expr`2 ${x2}^2 - 4 * ${x2}`);

    const status2 = await m2.solve(HiGHS);
    expect(status2).toBe("Optimal");
    expect(x2.value).toBeCloseTo(1.0, 4);
    expect(m2.objectiveValue).toBeCloseTo(-2.0, 4);
  });

  it("solves optimization problem with chained exponentiation in objective: min x**1**2 - 4 * x", async () => {
    const m = new Model("ChainedPowerQP");
    const x = m.continuous("x", { lb: 0, ub: 10 });

    // x**1**2 parses as x**(1**2) = x^1 = x.
    // So obj = x - 4x = -3x.
    // For x in [0, 10], min -3x achieves optimum at x = 10, obj = -30.
    m.minimize(expr`${x}**1**2 - 4 * ${x}`);

    const status = await m.solve(HiGHS);
    expect(status).toBe("Optimal");
    expect(x.value).toBeCloseTo(10.0, 4);
    expect(m.objectiveValue).toBeCloseTo(-30.0, 4);
  });
});
