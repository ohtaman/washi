import { describe, it, expect } from "vitest";
import { Model, expr, c } from "../src/index.js";
import { generateLpString } from "../src/modeler/lp-writer.js";
import { HiGHS } from "../src/modeler/solvers/highs.js";

describe("Quadratic Programming (QP) with HiGHS", () => {
  it("generates CPLEX LP format with quadratic objective [ ... ] / 2", () => {
    const m = new Model("TestQP");
    const x = m.addVar({ name: "x" });
    const y = m.addVar({ name: "y" });

    // min 3x + x^2 + y^2
    m.minimize(x.mul(3).add(x.mul(x)).add(y.mul(y)));
    m.addConstraint(x.add(y).ge(4), "c1");

    const { lpString } = generateLpString({
      name: m.name,
      sense: m.sense,
      objective: m.objective,
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
    const x = m.addVar({ name: "x" });
    const y = m.addVar({ name: "y" });

    // min 3x + x^2 + y^2 subject to x + y >= 4, x >= 0, y >= 0
    // Analytical optimum: x = 1.25, y = 2.75, obj = 12.875
    m.minimize(x.mul(3).add(x.mul(x)).add(y.mul(y)));
    m.addConstraint(x.add(y).ge(4), "sum_ge_4");

    const status = await m.solve(HiGHS);

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(1.25, 4);
    expect(y.value).toBeCloseTo(2.75, 4);
    expect(m.objectiveValue).toBeCloseTo(12.875, 4);
  });

  it("solves Markowitz Portfolio Optimization (2 assets with covariance)", async () => {
    const m = new Model("PortfolioQP");
    const w1 = m.addVar({ name: "w1", lb: 0, ub: 1 });
    const w2 = m.addVar({ name: "w2", lb: 0, ub: 1 });

    // Sum of weights = 1.0 (100% investment)
    m.addConstraint(w1.add(w2).eq(1), "budget");

    // Target expected return >= 14%
    // Asset 1 return = 10%, Asset 2 return = 20%
    m.addConstraint(w1.mul(0.10).add(w2.mul(0.20)).ge(0.14), "target_return");

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
    const x = m.addVar({ name: "x" });
    const y = m.addVar({ name: "y" });

    // min 3x + x^2 + y^2 subject to x + y >= 4, x >= 0, y >= 0
    // Analytical optimum: x = 1.25, y = 2.75, obj = 12.875
    m.minimize(expr`3 * ${x} + ${x}^2 + ${y}^2`);
    m.addConstraint(expr`${x} + ${y} >= 4`);

    const status = await m.solve(HiGHS);

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(1.25, 4);
    expect(y.value).toBeCloseTo(2.75, 4);
    expect(m.objectiveValue).toBeCloseTo(12.875, 4);
  });
});
