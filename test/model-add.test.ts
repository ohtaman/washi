import { describe, it, expect } from "vitest";
import { Model, sum, expr, maximize } from "../src/modeler/index.js";

describe("Canonical m.constraint(...) API & Retirement of m.add(...)", () => {
  it("adds Constraint objects using method chaining or direct calls via m.constraint(...)", async () => {
    const m = new Model({ name: "CanonicalConstraintTest" });
    expect((m as any).add).toBeUndefined();

    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });

    const c1 = x.mul(2).add(y).le(14, "budget");
    const resAdd = m.constraint(c1);

    expect(m.numConstrs).toBe(1);
    expect(resAdd).toBe(m);
    expect(m.getConstraintByName("budget")).toBe(c1);

    m.constraint(x.add(y.mul(2)).le(14, "capacity"));
    expect(m.numConstrs).toBe(2);

    m.objective(maximize(x.mul(3).add(y.mul(4))));
    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(4.666666, 4);
    expect(y.value).toBeCloseTo(4.666666, 4);
    expect(m.objectiveValue).toBeCloseTo(32.666666, 4);
  });

  it("adds Tagged Template Literal constraints via m.constraint(expr`...`)", async () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    m.constraint(expr`${x} + 2 * ${y} <= 8`);
    m.constraint(expr`2 * ${x} + ${y} <= 8`);

    expect(m.numConstrs).toBe(2);

    m.objective(maximize(x.add(y)));
    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(x.value).toBeCloseTo(2.666666, 4);
    expect(y.value).toBeCloseTo(2.666666, 4);
  });

  it("adds string constraints via m.constraint('x + y <= 10')", async () => {
    const m = new Model();
    m.continuous("x", { lb: 0 });
    m.continuous("y", { lb: 0 });

    m.constraint("x + y <= 10", "sum_limit");
    expect(m.numConstrs).toBe(1);
    expect(m.getConstraintByName("sum_limit")?.rhs).toBe(10);
  });

  it("adds an array of constraints in batch via m.constraint([c1, c2, ...])", async () => {
    const m = new Model();
    const vars = m.continuous(4, { lb: 0, ub: 5 }); // x_0, x_1, x_2, x_3

    m.constraint([
      vars[0].add(vars[1]).le(6),
      vars[2].add(vars[3]).le(8),
      sum(vars).ge(4),
    ]);

    expect(m.numConstrs).toBe(3);
  });

  it("supports chaining multiple m.constraint calls fluently", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");

    const returnedModel = m
      .constraint(x.ge(1))
      .constraint(y.ge(2))
      .constraint(x.add(y).le(10));

    expect(returnedModel).toBe(m);
    expect(m.numConstrs).toBe(3);
  });
});
