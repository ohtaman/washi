import { describe, it, expect } from "vitest";
import { Model, sum, expr } from "../src/modeler/index.js";

describe("TDD: Indicator Constraints & Big-M Auto-Linearization", () => {
  it("enforces constraint f(x) <= b only when indicator variable z == 1 (activeValue = 1)", async () => {
    const m = new Model({ name: "FacilityActivation" });
    // Continuous capacity x, binary activation flag z
    const x = m.addVar({ name: "x", lb: 0, ub: 100 });
    const z = m.addVar({ name: "z", type: "Binary" });

    // When z = 0, factory is closed: x <= 0
    // When z = 1, factory is open: x <= 50
    // We formulate: if z == 0 then x <= 0 (i.e. x <= 50 * z)
    // Using addIndicator:
    // "If z == 0, then x <= 0" with M = 100
    m.addIndicator(z, x.le(0), { activeValue: 0, M: 100, name: "factory_closed" });

    // Fixed cost for opening factory ($20), profit from production ($1/unit)
    // Objective: Maximize profit - cost = 1*x - 20*z
    m.maximize(x.sub(z.mul(20)));

    // Case 1: Capacity upper bound 30. Profit = 30 - 20 = 10 > 0 -> should open (z=1, x=30)
    m.add(x.le(30));
    let status = await m.solve();
    expect(status).toBe("Optimal");
    expect(z.value).toBe(1);
    expect(x.value).toBe(30);
    expect(m.objectiveValue).toBe(10);
  });

  it("forces production to 0 if fixed cost outweighs profits (z = 0)", async () => {
    const m = new Model();
    const x = m.addVar({ name: "x", lb: 0 });
    const z = m.addVar({ name: "z", type: "Binary" });

    // if z == 0 then x <= 0
    m.addIndicator(z, x.le(0), { activeValue: 0, M: 100 });

    // If demand is only 5 units, profit = 5 - 20 = -15 < 0 -> should not open (z=0, x=0)
    m.add(x.le(5));
    m.maximize(x.sub(z.mul(20)));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(z.value).toBe(0);
    expect(x.value).toBe(0);
    expect(m.objectiveValue).toBe(0);
  });

  it("handles >= constraint when indicator is active (activeValue = 1)", async () => {
    const m = new Model();
    const x = m.addVar({ name: "x", lb: 0, ub: 50 });
    const z = m.addVar({ name: "z", type: "Binary" });

    // If z == 1, then x >= 20 (minimum batch size)
    m.addIndicator(z, x.ge(20), { activeValue: 1, M: 50, name: "min_batch" });

    // Force z = 1
    m.add(z.eq(1));
    m.minimize(x);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(20);
  });

  it("handles equality constraint f(x) == b via two-sided Big-M linearization", async () => {
    const m = new Model();
    const x = m.addVar({ name: "x", lb: 0, ub: 100 });
    const z = m.addVar({ name: "z", type: "Binary" });

    // If z == 1, then x == 42
    m.addIndicator(z, x.eq(42), { activeValue: 1, M: 100, name: "exact_value" });

    m.add(z.eq(1));
    m.minimize(x);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(42);
  });

  it("supports expr`...` tagged template literal directly without type assertions", async () => {
    const m = new Model("IndicatorExprTest");
    const x = m.addVar({ name: "x", lb: 0, ub: 200 });
    const b = m.addVar({ name: "b", type: "Binary" });

    // Directly pass expr`...` to m.indicator without cast
    m.indicator(b, expr`${x} >= 100`, { activeValue: 1, M: 1000 });

    // Force b = 1
    m.addConstraint(expr`${b} == 1`);
    m.minimize(expr`${x}`);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(100);
  });

  it("rejects quadratic expressions or invalid comparisons in indicator()", () => {
    const m = new Model();
    const x = m.addVar({ name: "x" });
    const b = m.addVar({ name: "b", type: "Binary" });

    expect(() => m.indicator(b, expr`${x} * ${x}` as any)).toThrow(
      /Quadratic expressions or constraints are not supported in indicator constraints/
    );
    expect(() => m.indicator(b, expr`2 * ${x} + 5` as any)).toThrow(
      /Invalid constraint expression passed to indicator/
    );
  });
});
