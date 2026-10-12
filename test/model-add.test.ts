import { describe, it, expect } from "vitest";
import { Model, Var, c, LinExpr, sum } from "../src/modeler/index.js";

describe("TDD: Classical m.add(...) API", () => {
  it("adds Constraint objects using classical method chaining or direct calls", async () => {
    const m = new Model({ name: "ClassicalAddTest" });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });

    // Classical builder: x.mul(2).add(y).le(14)
    const c1 = x.mul(2).add(y).le(14, "budget");
    const resAdd = m.add(c1);

    expect(m.numConstrs).toBe(1);
    expect(resAdd).toBe(m);
    expect(m.getConstraintByName("budget")).toBe(c1);

    // Method chaining: m.add(...).add(...)
    m.add(x.add(y.mul(2)).le(14, "capacity"));
    expect(m.numConstrs).toBe(2);

    m.maximize(x.mul(3).add(y.mul(4)));
    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(4.666666, 4);
    expect(y.value).toBeCloseTo(4.666666, 4);
    expect(m.objectiveValue).toBeCloseTo(32.666666, 4);
  });

  it("adds Tagged Template Literal constraints via m.add(c`...`)", async () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    m.add(c`${x} + 2 * ${y} <= 8`);
    m.add(c`2 * ${x} + ${y} <= 8`);

    expect(m.numConstrs).toBe(2);

    m.maximize(x.add(y));
    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(x.value).toBeCloseTo(2.666666, 4);
    expect(y.value).toBeCloseTo(2.666666, 4);
  });

  it("adds string constraints via m.add('x + y <= 10')", async () => {
    const m = new Model();
    m.continuous("x", { lb: 0 });
    m.continuous("y", { lb: 0 });

    m.add("x + y <= 10", "sum_limit");
    expect(m.numConstrs).toBe(1);
    expect(m.getConstraintByName("sum_limit")?.rhs).toBe(10);
  });

  it("adds an array of constraints in batch via m.add([c1, c2, ...])", async () => {
    const m = new Model();
    const vars = m.continuous(4, { lb: 0, ub: 5 }); // x_0, x_1, x_2, x_3

    m.add([
      vars[0].add(vars[1]).le(6),
      vars[2].add(vars[3]).le(8),
      sum(vars).ge(4),
    ]);

    expect(m.numConstrs).toBe(3);
  });

  it("adds externally constructed Var via m.add(new Var(...))", () => {
    const m = new Model();
    const v = new Var({ name: "custom_var", lb: 1, ub: 10 });

    m.add(v);

    expect(m.numVars).toBe(1);
    expect(m.getVarByName("custom_var")).toBe(v);
  });

  it("supports chaining multiple m.add calls fluently", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");

    const returnedModel = m
      .add(x.ge(1))
      .add(y.ge(2))
      .add(x.add(y).le(10));

    expect(returnedModel).toBe(m);
    expect(m.numConstrs).toBe(3);
  });
});
