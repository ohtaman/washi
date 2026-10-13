import { describe, it, expect } from "vitest";
import {
  Model,
  expr,
  c,
  maximize,
  minimize,
  type ConstraintItem,
  type ObjectiveExpr,
} from "../src/index.js";
import { HiGHS } from "../src/modeler/solvers/highs.js";

describe("New Modeler API: constraint, objective, solve, conflicts", () => {
  it("supports model.constraint(...) with fluent chaining and arrays", async () => {
    const m = new Model("ChainingTest");
    const x = m.continuous("x", { lb: 0, ub: 20 });
    const y = m.continuous("y", { lb: 0, ub: 20 });

    // Method chaining with constraint()
    m.constraint(c`${x} + 2 * ${y} <= 40`, "wood")
      .constraint(c`${x} <= 15`, "cap_x")
      .constraint([
        c`${y} <= 18`,
        "x + y <= 30",
      ]);

    expect(m.numConstrs).toBe(4);

    m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(m.values.get("x")).toBe(15);
    expect(m.values.get("y")).toBe(12.5);
    expect(m.objectiveValue).toBe(30 * 15 + 50 * 12.5); // 1075
  });

  it("strictly rejects raw arithmetic expressions in model.constraint()", () => {
    const m = new Model("StrictConstraintTest");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // Raw LinExpr without comparison
    expect(() => (m.constraint as any)(x.add(y))).toThrow(
      /Cannot add a linear expression without a comparison operator/
    );

    // Raw QuadExpr without comparison
    expect(() => (m.constraint as any)(x.mul(x))).toThrow(
      /Cannot add a quadratic expression without a comparison operator/
    );

    // String without comparison operator
    expect(() => (m.constraint as any)("x + 2 * y")).toThrow(
      /Constraint must contain a comparison operator/
    );
  });

  it("strictly rejects Constraint in objective() and maximize()/minimize()", () => {
    const m = new Model("StrictObjectiveTest");
    const x = m.continuous("x");

    // Passing Constraint to objective() throws an Error
    expect(() => (m.objective as any)({ expr: x.le(10) as any, sense: "Maximize" })).toThrow(
      /Cannot set objective to a constraint comparison/
    );
    expect(() => (m.setObjective as any)(x.le(10))).toThrow(
      /Cannot set objective to a constraint comparison/
    );
  });

  it("replaces prior objective when objective() is called repeatedly", async () => {
    const m = new Model("ObjectiveReplacementTest");
    const x = m.continuous("x", { lb: 0, ub: 10 });

    // First objective: maximize x
    m.objective(maximize(x));
    expect(m.sense).toBe("Maximize");

    // Second objective: minimize 2*x (completely replaces previous)
    m.objective(minimize(x.mul(2)));
    expect(m.sense).toBe("Minimize");

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.values.get("x")).toBe(0); // Minimized to lower bound
    expect(m.objectiveValue).toBe(0);
  });

  it("supports getter overload m.objective() to inspect current expression", () => {
    const m = new Model("GetterOverloadTest");
    const x = m.continuous("x");
    const y = m.continuous("y");

    m.objective(maximize(expr`10 * ${x} + 20 * ${y}`));
    const current = m.objective();
    expect(current).toBeDefined();
    expect("terms" in current).toBe(true);
  });

  it("solves as a feasibility problem when no objective is set", async () => {
    const m = new Model("FeasibilityTest");
    const x = m.continuous("x", { lb: 5, ub: 10 });
    const y = m.continuous("y", { lb: 5, ub: 10 });

    m.constraint(c`${x} + ${y} == 15`);
    // No objective configured!
    const status = await m.solve();

    expect(status).toBe("Optimal");
    const valX = m.values.get("x") as number;
    const valY = m.values.get("y") as number;
    expect(valX + valY).toBeCloseTo(15, 4);
    expect(valX).toBeGreaterThanOrEqual(5);
    expect(valY).toBeGreaterThanOrEqual(5);
  });

  it("resets solution state before executing solve()", async () => {
    const m = new Model("ResetTest");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.objective(maximize(x));

    await m.solve();
    expect(m.values.get("x")).toBe(10);
    expect(m.status).toBe("Optimal");

    // Now introduce an infeasible constraint
    m.constraint(c`${x} <= -1`);

    await m.solve();
    expect(m.status).toBe("Infeasible");
    expect(x.value).toBeNull();
    expect(m.objectiveValue).toBeNull();
  });

  it("provides conflicts as undefined when satisfiable or not diagnosed", async () => {
    const m = new Model("ConflictsUndefinedTest");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.constraint(c`${x} >= 2`);

    // Before solve
    expect(m.conflicts).toBeUndefined();

    // After solve (satisfiable LP)
    await m.solve();
    expect(m.conflicts).toBeUndefined();
  });

  it("ensures optimize() is an exact alias for solve()", async () => {
    const m = new Model("OptimizeAliasTest");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.objective(maximize(x));

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(10);
  });

  it("provides conflicts string[] on unsatisfiable SMT models via check()", async () => {
    await import("../src/modeler/solvers/z3/index.js");
    const m = new Model({ solver: "z3" });
    const b = m.bool("flag");
    m.constraint(b, "flag_must_be_true");
    m.constraint(b.not(), "flag_must_be_false");

    const res = await m.check();
    expect(res.status).toBe("Unsat");
    expect(res.conflicts).toBeDefined();
    expect(Array.isArray(res.conflicts)).toBe(true);
    expect(res.conflicts).toEqual(res.unsatCore);
    expect(m.conflicts).toEqual(res.conflicts);
  });
});
