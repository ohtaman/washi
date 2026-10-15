import { describe, it, expect } from "vitest";
import { Var } from "../src/modeler/variable.js";
import { LinExpr } from "../src/modeler/expression.js";
import { QuadExpr } from "../src/modeler/quad-expr.js";
import { expr, parseExpr } from "../src/modeler/parser.js";

describe("QuadExpr (Quadratic Expressions)", () => {
  it("creates a QuadExpr by multiplying two variables (x * x)", () => {
    const x = new Var({ name: "x" });
    const expr = x.mul(x);

    expect(expr).toBeInstanceOf(QuadExpr);
    expect(expr.quadTerms.size).toBe(1);
    expect(expr.linearTerms.size).toBe(0);
    expect(expr.constant).toBe(0);
  });

  it("creates a QuadExpr by multiplying distinct variables (x * y)", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });
    const expr = x.mul(y);

    expect(expr).toBeInstanceOf(QuadExpr);
    expect(expr.quadTerms.size).toBe(1);
  });

  it("handles symmetry: x * y and y * x combine into the same term", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });
    const expr = x.mul(y).add(y.mul(x));

    expect(expr).toBeInstanceOf(QuadExpr);
    expect(expr.quadTerms.size).toBe(1);
    // Coefficient should be 1 + 1 = 2
    const coeff = expr.getQuadCoeff(x, y);
    expect(coeff).toBe(2);
  });

  it("supports arithmetic with LinExpr, Var, and numbers", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });

    // x^2 + 3x + 2y + 5
    const q1 = x.mul(x).add(x.mul(3)).add(y.mul(2)).add(5);
    expect(q1.constant).toBe(5);
    expect(q1.linearTerms.get(x)).toBe(3);
    expect(q1.linearTerms.get(y)).toBe(2);
    expect(q1.getQuadCoeff(x, x)).toBe(1);

    // Multiply LinExpr by Var: (2x + 1) * y = 2xy + y
    const lin = x.mul(2).add(1);
    const q2 = lin.mul(y);
    expect(q2).toBeInstanceOf(QuadExpr);
    expect(q2.getQuadCoeff(x, y)).toBe(2);
    expect(q2.linearTerms.get(y)).toBe(1);
    expect(q2.constant).toBe(0);
  });

  it("computes the numerical value correctly when variables have values", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });

    // f(x, y) = 2*x^2 + 3*x*y + y^2 + 4*x + 10
    const f = x.mul(x).mul(2)
      .add(x.mul(y).mul(3))
      .add(y.mul(y))
      .add(x.mul(4))
      .add(10);

    expect(f.value).toBeNull();

    x.value = 2;
    y.value = 3;
    // 2*(4) + 3*(6) + 9 + 4*(2) + 10 = 8 + 18 + 9 + 8 + 10 = 53
    expect(f.value).toBe(53);
  });

  it("supports sub, mul(scalar), div, and neg", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });

    const q = x.mul(x).sub(y.mul(y));
    expect(q.getQuadCoeff(x, x)).toBe(1);
    expect(q.getQuadCoeff(y, y)).toBe(-1);

    const doubled = q.mul(2);
    expect(doubled.getQuadCoeff(x, x)).toBe(2);
    expect(doubled.getQuadCoeff(y, y)).toBe(-2);

    const halved = doubled.div(2);
    expect(halved.getQuadCoeff(x, x)).toBe(1);
    expect(halved.getQuadCoeff(y, y)).toBe(-1);

    const negated = q.neg();
    expect(negated.getQuadCoeff(x, x)).toBe(-1);
    expect(negated.getQuadCoeff(y, y)).toBe(1);
  });

  it("constructs quadratic expression via x.mul(y).add(x.mul(x).mul(2)) as documented in expressions guide", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });

    // Represents x * y + 2 * x^2
    const quad = x.mul(y).add(x.mul(x).mul(2));
    expect(quad).toBeInstanceOf(QuadExpr);
    expect(quad.getQuadCoeff(x, y)).toBe(1);
    expect(quad.getQuadCoeff(x, x)).toBe(2);
  });

  it("returns actual QuadExpr instance when multiplying constant-only QuadExpr by LinExpr", () => {
    const x = new Var({ name: "x" });
    const q = x.mul(x).sub(x.mul(x)).add(2).mul(x.add(1));

    expect(q).toBeInstanceOf(QuadExpr);
    expect(q.getQuadCoeff(x, x)).toBe(0);
    expect(q.linearTerms.get(x)).toBe(2);
    expect(q.constant).toBe(2);
  });

  it("prunes cancelled linear terms and matches across method chaining, expr, and parseExpr", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });

    // (x + 1) * (-x + 1) = -x^2 + 1 (linear terms x and -x cancel out)
    const viaMethod = x.add(1).mul(x.neg().add(1));
    const viaTemplate = expr`(${x} + 1) * (-${x} + 1)`;
    const viaParse = parseExpr("(x + 1) * (-x + 1)", (name) => (name === "x" ? x : undefined));

    for (const candidate of [viaMethod, viaTemplate, viaParse]) {
      expect(candidate).toBeInstanceOf(QuadExpr);
      const q = candidate as QuadExpr;
      expect(q.getQuadCoeff(x, x)).toBe(-1);
      expect(q.linearTerms.size).toBe(0);
      expect(q.constant).toBe(1);
    }

    // ((2x - 3y + 4)^2 - 2x * (2x - 3y)) / 2
    const baseMethod = x.mul(2).sub(y.mul(3)).add(4);
    const complexMethod = baseMethod
      .mul(baseMethod)
      .sub(x.mul(2).mul(x.mul(2).sub(y.mul(3))))
      .div(2);
    const complexTemplate = expr`((2 * ${x} - 3 * ${y} + 4)^2 - 2 * ${x} * (2 * ${x} - 3 * ${y})) / (1 + 1)` as QuadExpr;

    expect(complexTemplate.getQuadCoeff(x, x)).toBe(complexMethod.getQuadCoeff(x, x));
    expect(complexTemplate.getQuadCoeff(x, y)).toBe(complexMethod.getQuadCoeff(x, y));
    expect(complexTemplate.getQuadCoeff(y, y)).toBe(complexMethod.getQuadCoeff(y, y));
    expect(complexTemplate.linearTerms.get(x)).toBe(complexMethod.linearTerms.get(x));
    expect(complexTemplate.linearTerms.get(y)).toBe(complexMethod.linearTerms.get(y));
    expect(complexTemplate.constant).toBe(complexMethod.constant);
  });
});

