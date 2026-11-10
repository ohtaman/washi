import { describe, it, expect } from "vitest";
import { Model, Constraint, BoolVar, BoolOp, implies, sum, expr, maximize } from "../src/modeler/index.js";

describe("Canonical m.constraint(...) API & Retirement of m.add(...)", () => {
  it("adds Constraint objects and returns the registered Constraint via m.constraint(...)", async () => {
    const m = new Model({ name: "CanonicalConstraintTest" });
    expect((m as any).add).toBeUndefined();

    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });

    const c1 = x.mul(2).add(y).le(14, "budget");
    const resAdd = m.constraint(c1);

    expect(m.numConstrs).toBe(1);
    expect(resAdd).toBe(c1);
    expect(m.getConstraintByName("budget")).toBe(c1);

    const c2 = m.constraint(x.add(y.mul(2)).le(14, "capacity"));
    expect(c2).toBeInstanceOf(Constraint);
    expect(c2.name).toBe("capacity");
    expect(m.numConstrs).toBe(2);

    m.objective(maximize(x.mul(3).add(y.mul(4))));
    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(4.666666, 4);
    expect(y.value).toBeCloseTo(4.666666, 4);
    expect(m.objectiveValue).toBeCloseTo(32.666666, 4);
    expect(resAdd.dual).not.toBeNull();
    expect(c2.dual).not.toBeNull();
  });

  it("adds Tagged Template Literal constraints via m.constraint(expr`...`) and narrows return type to Constraint", async () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    const c1 = m.constraint(expr`${x} + 2 * ${y} <= 8`, "c1");
    const c2 = m.constraint(expr`2 * ${x} + ${y} <= 8`, "c2");

    expect(c1).toBeInstanceOf(Constraint);
    expect(c2).toBeInstanceOf(Constraint);
    expect(m.numConstrs).toBe(2);

    m.objective(maximize(x.add(y)));
    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(x.value).toBeCloseTo(2.666666, 4);
    expect(y.value).toBeCloseTo(2.666666, 4);
    expect(c1.dual).toBeCloseTo(1 / 3, 4);
    expect(c2.dual).toBeCloseTo(1 / 3, 4);
  });

  it("adds string constraints via m.constraint('x + y <= 10') and returns the parsed Constraint", async () => {
    const m = new Model();
    m.continuous("x", { lb: 0 });
    m.continuous("y", { lb: 0 });

    const sumLimit = m.constraint("x + y <= 10", "sum_limit");
    expect(sumLimit).toBeInstanceOf(Constraint);
    expect(sumLimit.name).toBe("sum_limit");
    expect(sumLimit.rhs).toBe(10);
    expect(m.numConstrs).toBe(1);
    expect(m.getConstraintByName("sum_limit")).toBe(sumLimit);
  });

  it("adds an array of constraints in batch via m.constraint([c1, c2, ...]) and returns Constraint[]", async () => {
    const m = new Model();
    const vars = m.continuous(4, { lb: 0, ub: 5 }); // x_0, x_1, x_2, x_3

    const added = m.constraint([
      vars[0].add(vars[1]).le(6),
      vars[2].add(vars[3]).le(8),
      sum(vars).ge(4),
    ]);

    expect(added).toHaveLength(3);
    expect(added).toEqual(m.constraints);
    expect(m.numConstrs).toBe(3);
  });

  it("returns BoolVar, BoolOp, and logical arrays when registering SMT logical constraints", () => {
    const m = new Model();
    const flagA = m.bool("flagA");
    const flagB = m.bool("flagB");
    const x = m.continuous("x", { lb: 0, ub: 10 });

    const registeredVar = m.constraint(flagA, "require_A");
    const registeredOp = m.constraint(implies(flagA, expr`${x} >= 5`), "a_implies_x");
    const registeredBatch = m.constraint([flagB, flagA.and(flagB)]);

    expect(registeredVar).toBe(flagA);
    expect(registeredVar).toBeInstanceOf(BoolVar);
    expect(registeredOp).toBeInstanceOf(BoolOp);
    expect(registeredBatch).toHaveLength(2);
    expect(registeredBatch[0]).toBe(flagB);
    expect(registeredBatch[1]).toBeInstanceOf(BoolOp);
    expect(m.logicalConstraints).toHaveLength(4);
  });
});
