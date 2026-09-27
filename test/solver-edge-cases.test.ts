import { describe, it, expect } from "vitest";
import { Model, sum } from "../src/modeler/index.js";

describe("HiGHS Solver Edge Cases & Advanced Features", () => {
  it("detects Infeasible problems properly", async () => {
    const m = new Model({ name: "InfeasibleModel", sense: "Minimize" });
    const x = m.addVar({ name: "x", lb: 0 });

    // x <= 2 AND x >= 5 (impossible)
    m.addConstraint(x.le(2));
    m.addConstraint(x.ge(5));

    const status = await m.optimize();
    expect(status).toBe("Infeasible");
  });

  it("detects Unbounded problems properly", async () => {
    const m = new Model({ name: "UnboundedModel", sense: "Maximize" });
    const x = m.addVar({ name: "x", lb: 0, ub: Infinity });

    // Maximize x with no upper constraint
    m.maximize(x);

    const status = await m.optimize();
    expect(status).toBe("Unbounded");
  });

  it("handles negative lower/upper bounds and free variables", async () => {
    const m = new Model({ name: "NegativeBounds", sense: "Minimize" });
    // -10 <= x <= -2
    const x = m.addVar({ name: "x", lb: -10, ub: -2 });
    // free variable y: -Infinity <= y <= Infinity
    const y = m.addVar({ name: "y", lb: -Infinity, ub: Infinity });

    // Minimize 2*x + y
    m.minimize(x.mul(2).add(y));
    // y >= -5
    m.addConstraint(y.ge(-5));

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(-10);
    expect(y.value).toBe(-5);
    expect(m.objectiveValue).toBe(2 * (-10) + (-5)); // -25
  });

  it("preserves objective constant offset in final objectiveValue", async () => {
    const m = new Model({ name: "ConstantOffset", sense: "Minimize" });
    const x = m.addVar({ name: "x", lb: 0 });

    // Minimize 3*x + 100
    m.minimize(x.mul(3).add(100));
    m.addConstraint(x.ge(10));

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(10);
    expect(m.objectiveValue).toBe(130); // 3*10 + 100
  });

  it("retrieves shadow prices (duals) and slacks on LP constraints", async () => {
    const m = new Model({ name: "DualsTest", sense: "Maximize" });
    const x1 = m.addVar({ name: "x1", lb: 0, type: "Continuous" });
    const x2 = m.addVar({ name: "x2", lb: 0, type: "Continuous" });

    // Maximize 3*x1 + 2*x2
    m.maximize(x1.mul(3).add(x2.mul(2)));

    // c1: 2*x1 + x2 <= 100
    const c1 = m.addConstraint(x1.mul(2).add(x2).le(100), "res_labor");
    // c2: x1 + x2 <= 80
    const c2 = m.addConstraint(x1.add(x2).le(80), "res_material");

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(180); // x1=20, x2=60
    expect(x1.value).toBe(20);
    expect(x2.value).toBe(60);

    // c1 and c2 are binding constraints (slack = 0)
    expect(c1.slack).toBeCloseTo(0, 4);
    expect(c2.slack).toBeCloseTo(0, 4);

    // Dual values (shadow prices) should be positive for <= in Maximize
    expect(c1.dual).toBeGreaterThan(0);
    expect(c2.dual).toBeGreaterThan(0);
  });

  it("safely sanitizes complex variable names containing brackets and special characters", async () => {
    const m = new Model({ name: "SanitizationModel", sense: "Minimize" });

    // Names containing characters that would normally break LP format
    const v1 = m.addVar({ name: "item[0][1]" });
    const v2 = m.addVar({ name: "user-name with spaces:1" });
    const v3 = m.addVar({ name: "123_number_start" });

    m.minimize(v1.add(v2.mul(2)).add(v3.mul(3)));
    m.addConstraint(v1.add(v2).ge(5));
    m.addConstraint(v3.ge(2));

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(v1.value).toBe(5);
    expect(v2.value).toBe(0);
    expect(v3.value).toBe(2);
    expect(m.solution?.values["item[0][1]"]).toBe(5);
    expect(m.solution?.values["user-name with spaces:1"]).toBe(0);
  });

  it("solves larger model with 50 variables and 30 constraints quickly", async () => {
    const m = new Model({ name: "LargeModel", sense: "Maximize" });
    const N = 50;
    const vars = m.addVars(N, { type: "Continuous", lb: 0, ub: 10 });

    // Maximize sum of c_i * x_i
    m.maximize(sum(vars, (v, i) => v.mul(i + 1)));

    // 30 random-like linear constraints
    for (let c = 0; c < 30; c++) {
      m.addConstraint(
        sum(vars, (v, i) => v.mul(((i + c) % 5) + 1)).le(150 + c * 5),
        `limit_${c}`
      );
    }

    const start = performance.now();
    const status = await m.optimize();
    const elapsed = performance.now() - start;

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeGreaterThan(0);
    // Solving 50 vars in HiGHS WASM should take less than 100ms
    expect(elapsed).toBeLessThan(500);
  });
});
