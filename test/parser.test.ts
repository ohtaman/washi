import { describe, it, expect } from "vitest";
import { Var } from "../src/modeler/variable.js";
import { parseExpr, parseConstraint, expr } from "../src/modeler/parser.js";

describe("Algebraic Parser & DSL", () => {
  const x = new Var({ name: "x" });
  const y = new Var({ name: "y" });
  const z = new Var({ name: "z" });

  const resolver = (name: string) => {
    if (name === "x") return x;
    if (name === "y") return y;
    if (name === "z") return z;
    return undefined;
  };

  it("parses linear expressions with addition and subtraction", () => {
    const e = parseExpr("30 * x + 50 * y - 10", resolver);
    expect(e.terms.get(x)).toBe(30);
    expect(e.terms.get(y)).toBe(50);
    expect(e.constant).toBe(-10);
  });

  it("handles parentheses and precedence", () => {
    const e = parseExpr("2 * (x + 3 * y) + 4", resolver);
    expect(e.terms.get(x)).toBe(2);
    expect(e.terms.get(y)).toBe(6);
    expect(e.constant).toBe(4);
  });

  it("handles unary minus and decimals", () => {
    const e = parseExpr("-2.5 * x + 1.25 * y", resolver);
    expect(e.terms.get(x)).toBe(-2.5);
    expect(e.terms.get(y)).toBe(1.25);
  });

  it("parses constraints with <=, >=, and ==", () => {
    const c1 = parseConstraint("x + 2 * y <= 40", resolver, "c1");
    expect(c1.name).toBe("c1");
    expect(c1.sense).toBe("<=");
    expect(c1.rhs).toBe(40);
    expect(c1.lhs.terms.get(x)).toBe(1);
    expect(c1.lhs.terms.get(y)).toBe(2);

    const c2 = parseConstraint("3 * x - y >= 15", resolver);
    expect(c2.sense).toBe(">=");
    expect(c2.rhs).toBe(15);

    const c3 = parseConstraint("x + y == 10", resolver);
    expect(c3.sense).toBe("==");
    expect(c3.rhs).toBe(10);
  });

  it("handles variables on both sides of constraint", () => {
    const c = parseConstraint("2 * x + y <= z + 8", resolver);
    expect(c.sense).toBe("<=");
    expect(c.rhs).toBe(8);
    expect(c.lhs.terms.get(x)).toBe(2);
    expect(c.lhs.terms.get(y)).toBe(1);
    expect(c.lhs.terms.get(z)).toBe(-1);
  });

  it("throws clear error on unknown variables", () => {
    expect(() => parseExpr("x + unknown_var <= 10", resolver)).toThrow("Unknown variable 'unknown_var'");
  });

  it("throws error on non-linear terms (e.g. x * y)", () => {
    expect(() => parseExpr("x * y + 5", resolver)).toThrow("non-linear term");
  });

  it("evaluates tagged template literal expr`...` for expressions and constraints", () => {
    const e = expr`30 * ${x} + 50 * ${y} - 5`;
    expect("terms" in e).toBe(true);
    if ("terms" in e) {
      expect(e.terms.get(x)).toBe(30);
      expect(e.terms.get(y)).toBe(50);
      expect(e.constant).toBe(-5);
    }

    const c = expr`${x} + 2 * ${y} <= 40`;
    expect("lhs" in c).toBe(true);
    if ("lhs" in c) {
      expect(c.sense).toBe("<=");
      expect(c.rhs).toBe(40);
      expect(c.lhs.terms.get(x)).toBe(1);
      expect(c.lhs.terms.get(y)).toBe(2);
    }
  });
});
