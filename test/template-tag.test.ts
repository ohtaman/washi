import { describe, it, expect } from "vitest";
import {
  Model,
  Var,
  LinExpr,
  Constraint,
  QuadExpr,
  c,
  expr,
  parseExpr,
  parseConstraint,
} from "../src/index.js";

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

  it("preserves finite numeric interpolations including scientific notation, negative numbers, 0, and -0", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");

    const expExpr = expr`${1e-7} * ${x} + ${-2.5e-6} * ${y} + ${1e-9}` as LinExpr;
    expect(expExpr.terms.get(x)).toBe(1e-7);
    expect(expExpr.terms.get(y)).toBe(-2.5e-6);
    expect(expExpr.constant).toBe(1e-9);

    const negZeroExpr = expr`${-0}` as LinExpr;
    expect(Object.is(negZeroExpr.constant, -0)).toBe(true);

    const posZeroExpr = expr`${0}` as LinExpr;
    expect(Object.is(posZeroExpr.constant, 0)).toBe(true);

    const negPowerExpr = expr`${-2}^2 + ${3} * ${x}^${2}` as QuadExpr;
    expect(negPowerExpr).toBeInstanceOf(QuadExpr);
    expect(negPowerExpr.constant).toBe(4);
    expect(negPowerExpr.getQuadCoeff(x, x)).toBe(3);

    const expConstr = c`${1e-7} * ${x} - ${5e-6} * ${y} <= ${2.5e-4}`;
    expect(expConstr.lhs.terms.get(x)).toBe(1e-7);
    expect(expConstr.lhs.terms.get(y)).toBe(-5e-6);
    expect(expConstr.rhs).toBe(2.5e-4);

    // Small scientific coefficients below 1e-12 must not be discarded, including repeated sums and divisors
    const tinyTemplate = expr`1 + ${1e-13} * ${x} + ${1e-13} * ${x}` as LinExpr;
    expect(tinyTemplate.terms.get(x)).toBe(2e-13);
    expect(tinyTemplate.constant).toBe(1);

    const tinyDiv = expr`${x} / ${1e-13}` as LinExpr;
    expect(tinyDiv.terms.get(x)).toBeCloseTo(1e13, 0);

    const tinyQuad = expr`${1e-13} * ${x}^2 + ${1e-13} * ${x}^2` as QuadExpr;
    expect(tinyQuad.getQuadCoeff(x, x)).toBe(2e-13);

    // Implicit multiplication at numeric boundaries and unary negation of negative numbers
    const implicitProd = expr`2${3}` as LinExpr;
    expect(implicitProd.constant).toBe(6);
    const doubleNeg = expr`-${-5}` as LinExpr;
    expect(doubleNeg.constant).toBe(5);
  });

  it("parses valid textual decimal and scientific notation literals", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");
    const resolver = (name: string) => (name === "x" ? x : name === "y" ? y : undefined);

    const parsed = parseExpr("1e-7 * x + .5 * y - 2.5E+3", resolver) as LinExpr;
    expect(parsed.terms.get(x)).toBe(1e-7);
    expect(parsed.terms.get(y)).toBe(0.5);
    expect(parsed.constant).toBe(-2500);

    const tinyParsed = parseExpr("1e-13 * x + 1e-13 * x", resolver) as LinExpr;
    expect(tinyParsed.terms.get(x)).toBe(2e-13);

    const residualParsed = parseExpr("1e12 * x - 999999999999.5 * x", resolver) as LinExpr;
    expect(residualParsed.terms.get(x)).toBe(0.5);

    const zeroScientific = parseExpr("0e-400 * x + 0.00 * y", resolver) as LinExpr;
    expect(zeroScientific.terms.size).toBe(0);

    const constr = parseConstraint("1.5e-4 * x + .25e2 * y <= 1E3", resolver);
    expect(constr.lhs.terms.get(x)).toBe(1.5e-4);
    expect(constr.lhs.terms.get(y)).toBe(25);
    expect(constr.rhs).toBe(1000);
  });

  it("rejects malformed numeric literals, incomplete exponents, trailing tokens, and invalid interpolations", () => {
    const m = new Model();
    const x = m.continuous("x");
    const b = m.bool("b");
    const emptyResolver = () => undefined;
    const xResolver = (name: string) => (name === "x" ? x : undefined);

    for (const malformed of [
      "1.2.3",
      "1..2",
      ".",
      "1.",
      ".5.2",
      "1e",
      "1E",
      "1e+",
      "1e-",
      "1e2.3",
      "1e2e3",
      "1.e5",
    ]) {
      expect(() => parseExpr(malformed, emptyResolver)).toThrow(/Invalid numeric literal/);
    }

    expect(() => parseExpr("1e309", emptyResolver)).toThrow(/overflows finite floating-point range/);
    expect(() => parseExpr("1e-324 * x", xResolver)).toThrow(/underflows to zero/);
    expect(() => parseExpr("x + 1 )", xResolver)).toThrow(/Unexpected token '\)'/);
    expect(() => parseConstraint("x <= 10 <= 20", xResolver)).toThrow(/Unexpected token '<='/);

    expect(() => expr`${NaN} * ${x}`).toThrow(/interpolated numbers must be finite/);
    expect(() => expr`${Infinity} * ${x}`).toThrow(/interpolated numbers must be finite/);
    expect(() => c`${x} <= ${-Infinity}`).toThrow(/interpolated numbers must be finite/);

    // Non-finite scalar products on zero-constant expressions and non-finite term additions must propagate
    expect(Number.isNaN(new LinExpr().mul(NaN).constant)).toBe(true);
    expect(Number.isNaN(x.sub(x).mul(Infinity).constant)).toBe(true);
    expect(Number.isNaN(new QuadExpr().mul(NaN).constant)).toBe(true);
    expect(x.mul(Infinity).add(x.mul(1)).terms.get(x)).toBe(Infinity);
    expect(() => expr`${new LinExpr().mul(NaN)} + ${x}`).toThrow(/Invalid non-finite constant/);
    expect(() => expr`${x.mul(Infinity).add(x.mul(1))}`).toThrow(/Invalid non-finite coefficient/);

    // Post-normalization overflow in constraints
    expect(() => c`${Number.MAX_VALUE} <= ${-Number.MAX_VALUE}`).toThrow(
      /Invalid non-finite right-hand side/
    );
    expect(() => c`${Number.MAX_VALUE} * ${x} <= ${-Number.MAX_VALUE} * ${x}`).toThrow(
      /Invalid non-finite coefficient/
    );

    // Collision-free placeholder identifiers in literal template text
    expect(() => expr`${2} + __num_0__`).toThrow(/Unknown variable '__num_0__'/);
    expect(() => expr`${2} + __washi_num_0__`).toThrow(/Unknown variable '__washi_num_0__'/);
    expect(() => expr`${x} + __ph_0__`).toThrow(/Unknown variable '__ph_0__'/);
    expect(() => expr`${x} + __washi_ph_0__`).toThrow(/Unknown variable '__washi_ph_0__'/);

    expect(() => expr`${null as unknown as number} * ${x}`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${undefined as unknown as number} * ${x}`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${"x" as unknown as number} + 1`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${b as unknown as Var} + 1`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${new LinExpr(new Map(), NaN)} + ${x}`).toThrow(/Invalid non-finite constant/);
  });
});

