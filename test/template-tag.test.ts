import { describe, it, expect } from "vitest";
import { Model, Var, LinExpr, Constraint, QuadExpr, c, expr } from "../src/index.js";

describe("Tagged Template Literal Syntax (c and expr)", () => {
  it("parses linear expression with variables and numbers via expr`...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // expr`30 * ${x} + 40 * ${y} + 15`
    const e = expr`30 * ${x} + 40 * ${y} + 15` as LinExpr;

    expect(e.terms.get(x)).toBe(30);
    expect(e.terms.get(y)).toBe(40);
    expect(e.constant).toBe(15);
  });

  it("handles negative terms and subtractions in expr`...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // expr`${x} - 5 * ${y} - 20`
    const e = expr`${x} - 5 * ${y} - 20` as LinExpr;

    expect(e.terms.get(x)).toBe(1);
    expect(e.terms.get(y)).toBe(-5);
    expect(e.constant).toBe(-20);
  });

  it("parses inequality constraints via c`... <= ...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // c`${x} + 2 * ${y} <= 10`
    const constr = c`${x} + 2 * ${y} <= 10`;

    expect(constr.sense).toBe("<=");
    expect(constr.rhs).toBe(10);
    expect(constr.lhs.terms.get(x)).toBe(1);
    expect(constr.lhs.terms.get(y)).toBe(2);
  });

  it("parses greater-than-or-equal constraints via c`... >= ...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // c`3 * ${x} - ${y} >= 5`
    const constr = c`3 * ${x} - ${y} >= 5`;

    expect(constr.sense).toBe(">=");
    expect(constr.rhs).toBe(5);
    expect(constr.lhs.terms.get(x)).toBe(3);
    expect(constr.lhs.terms.get(y)).toBe(-1);
  });

  it("parses equality constraints with variables on both sides via c`... == ...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // c`${x} == 2 * ${y} + 4` => x - 2*y == 4
    const constr = c`${x} == 2 * ${y} + 4`;

    expect(constr.sense).toBe("==");
    expect(constr.rhs).toBe(4);
    expect(constr.lhs.terms.get(x)).toBe(1);
    expect(constr.lhs.terms.get(y)).toBe(-2);
  });

  it("solves an optimization problem formulated cleanly using c`...` and expr`...`", async () => {
    const m = new Model("ProductionPlanningTTL");
    const chairs = m.integer("chairs", { lb: 0 });
    const tables = m.integer("tables", { lb: 0 });

    // Objective: Maximize profit 45 * chairs + 80 * tables
    m.maximize(expr`45 * ${chairs} + 80 * ${tables}`);

    // Constraints via c`...`
    m.constrain(c`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany");
    m.constrain(c`10 * ${chairs} + 15 * ${tables} <= 450`, "labor");

    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(chairs.value).toBe(24);
    expect(tables.value).toBe(14);
    expect(m.objectiveValue).toBe(45 * 24 + 80 * 14); // 2200
  });

  it("handles decimal floating-point coefficients correctly", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");

    const constr = c`0.25 * ${x} + 1.75 * ${y} <= 12.5`;
    expect(constr.lhs.terms.get(x)).toBeCloseTo(0.25);
    expect(constr.lhs.terms.get(y)).toBeCloseTo(1.75);
    expect(constr.rhs).toBeCloseTo(12.5);
  });

  it("throws clear error on malformed constraint expressions", () => {
    const m = new Model();
    const x = m.continuous("x");

    // Missing comparison operator
    expect(() => c`2 * ${x} + 5`).toThrow(/Constraint must contain a comparison operator/);
  });

  it("supports quadratic expressions and rejects degree > 2 or quadratic constraints in expr and c", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");
    const z = m.continuous("z");

    const q = expr`${x} * ${y} + 2 * ${x} * ${x}`;
    expect(q).toBeInstanceOf(QuadExpr);
    if (q instanceof QuadExpr) {
      expect(q.getQuadCoeff(x, y)).toBe(1);
      expect(q.getQuadCoeff(x, x)).toBe(2);
    }

    const qPower = expr`${x}^2 + ${y}**2`;
    expect(qPower).toBeInstanceOf(QuadExpr);
    if (qPower instanceof QuadExpr) {
      expect(qPower.getQuadCoeff(x, x)).toBe(1);
      expect(qPower.getQuadCoeff(y, y)).toBe(1);
    }

    expect(() => expr`${x} * ${y} * ${z}`).toThrow(
      /non-linear term of degree > 2/
    );
    expect(() => expr`${x}^3`).toThrow(
      /non-linear term of degree > 2/
    );
    expect(() => c`${x} * ${y} <= 10`).toThrow(
      /Quadratic constraints are not supported/
    );
  });

  it("parses linear, quadratic, and inline constraint expressions as documented in expressions guide", () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    // 1. Linear combination: 3*x + 5*y - 10
    const linearExpr = expr`3 * ${x} + 5 * ${y} - 10` as LinExpr;
    expect(linearExpr.terms.get(x)).toBe(3);
    expect(linearExpr.terms.get(y)).toBe(5);
    expect(linearExpr.constant).toBe(-10);

    // 2. Quadratic expression: x * y + 2 * x^2
    const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}` as QuadExpr;
    expect(quadExpr.getQuadCoeff(x, y)).toBe(1);
    expect(quadExpr.getQuadCoeff(x, x)).toBe(2);

    // 3. Inline linear constraint rejection in expr`...` and acceptance in c`...`
    expect(() => expr`${x} + 2 * ${y} <= 40`).toThrow(
      /Relational comparison operators/
    );

    const balanceConstraint = c`${x} + 2 * ${y} <= 40`;
    expect(balanceConstraint.sense).toBe("<=");
    expect(balanceConstraint.rhs).toBe(40);
    expect(balanceConstraint.lhs.terms.get(x)).toBe(1);
    expect(balanceConstraint.lhs.terms.get(y)).toBe(2);
  });
});
