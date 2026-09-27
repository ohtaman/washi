import { describe, it, expect } from "vitest";
import {
  LpProblem,
  LpVariable,
  LpMaximize,
  LpMinimize,
  LpInteger,
  LpBinary,
  LpContinuous,
  LpStatus,
  lpSum,
  value,
} from "../src/modeler/index.js";

describe("PuLP Compatibility Layer", () => {
  it("creates variable dictionaries with LpVariable.dicts", () => {
    const indices = ["A", "B", "C"];
    const x = LpVariable.dicts("item", indices, 0, 1, LpBinary);

    expect(x["A"].name).toBe("item_A");
    expect(x["B"].type).toBe("Binary");
    expect(x["C"].lb).toBe(0);
    expect(x["C"].ub).toBe(1);
  });

  it("handles problem definition and solution with pulp idioms", async () => {
    const prob = new LpProblem("Diet", LpMinimize);

    const x1 = new LpVariable("food1", 0, undefined, LpContinuous);
    const x2 = new LpVariable("food2", 0, undefined, LpContinuous);

    // Objective: Minimize 2*x1 + 3*x2
    prob.setObjective(x1.mul(2).add(x2.mul(3)));

    // Constraints:
    prob.addConstraint(x1.add(x2.mul(2)).ge(10), "nutrient1");
    prob.addConstraint(x1.mul(2).add(x2).ge(8), "nutrient2");

    await prob.solve();

    expect(prob.status).toBe("Optimal");
    expect(LpStatus[prob.status]).toBe("Optimal");
    expect(value(prob.objective)).toBeCloseTo(16, 3);
    expect(value(x1)).toBeCloseTo(2, 3);
    expect(value(x2)).toBeCloseTo(4, 3);
  });

  it("supports add() method for both objective and constraints", async () => {
    const prob = new LpProblem("AddMethodTest", LpMaximize);
    const x = new LpVariable("x", 0, 10, LpInteger);

    prob.add(x.mul(5)); // objective
    prob.add(x.le(6));  // constraint

    await prob.solve();

    expect(prob.status).toBe("Optimal");
    expect(x.varValue).toBe(6);
    expect(value(prob.objective)).toBe(30);
  });
});
