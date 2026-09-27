import { describe, it, expect } from "vitest";
import { Var } from "../src/modeler/variable.js";
import { LinExpr, sum, xsum, lpSum } from "../src/modeler/expression.js";

describe("LinExpr & Arithmetic Operations", () => {
  it("creates empty expression with zero constant", () => {
    const expr = new LinExpr();
    expect(expr.terms.size).toBe(0);
    expect(expr.constant).toBe(0);
    expect(expr.toString()).toBe("0");
  });

  it("adds and subtracts scalars", () => {
    let expr = new LinExpr();
    expr = expr.add(10);
    expect(expr.constant).toBe(10);
    expr = expr.sub(4);
    expect(expr.constant).toBe(6);
  });

  it("adds and subtracts variables with proper coefficient combining", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });

    let expr = x.mul(2).add(y.mul(3));
    expect(expr.terms.get(x)).toBe(2);
    expect(expr.terms.get(y)).toBe(3);

    // Add another x term
    expr = expr.add(x.mul(5));
    expect(expr.terms.get(x)).toBe(7);

    // Subtract y term completely
    expr = expr.sub(y.mul(3));
    expect(expr.terms.has(y)).toBe(false);
  });

  it("multiplies and divides expressions by scalars", () => {
    const x = new Var({ name: "x" });
    const expr = x.mul(3).add(6);

    const doubled = expr.mul(2);
    expect(doubled.terms.get(x)).toBe(6);
    expect(doubled.constant).toBe(12);

    const halved = expr.div(2);
    expect(halved.terms.get(x)).toBe(1.5);
    expect(halved.constant).toBe(3);

    expect(() => expr.div(0)).toThrow("Division by zero");
  });

  it("evaluates value when variable values are assigned", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });
    const expr = x.mul(3).add(y.mul(4)).add(10);

    expect(expr.value).toBe(null);

    x.value = 5;
    expect(expr.value).toBe(null); // y is still null

    y.value = 2;
    expect(expr.value).toBe(3 * 5 + 4 * 2 + 10); // 15 + 8 + 10 = 33
    expect(expr.getValue()).toBe(33);
  });

  it("handles sum, xsum, and lpSum aggregation functions", () => {
    const x0 = new Var({ name: "x0" });
    const x1 = new Var({ name: "x1" });
    const x2 = new Var({ name: "x2" });
    const vars = [x0, x1, x2];

    const s1 = sum(vars);
    expect(s1.terms.get(x0)).toBe(1);
    expect(s1.terms.get(x1)).toBe(1);
    expect(s1.terms.get(x2)).toBe(1);

    // sum with mapping function
    const weights = [10, 20, 30];
    const s2 = xsum(vars, (v, i) => v.mul(weights[i]));
    expect(s2.terms.get(x0)).toBe(10);
    expect(s2.terms.get(x1)).toBe(20);
    expect(s2.terms.get(x2)).toBe(30);

    // lpSum alias
    const s3 = lpSum([x0.mul(2), x1.mul(4)]);
    expect(s3.terms.get(x0)).toBe(2);
    expect(s3.terms.get(x1)).toBe(4);
  });

  it("creates comparison constraints correctly", () => {
    const x = new Var({ name: "x" });
    const y = new Var({ name: "y" });

    const c1 = x.add(y.mul(2)).le(10, "c1");
    expect(c1.sense).toBe("<=");
    expect(c1.rhs).toBe(10);
    expect(c1.lhs.terms.get(x)).toBe(1);
    expect(c1.lhs.terms.get(y)).toBe(2);

    const c2 = x.mul(3).ge(y.add(5), "c2");
    expect(c2.sense).toBe(">=");
    expect(c2.rhs).toBe(5);
    expect(c2.lhs.terms.get(x)).toBe(3);
    expect(c2.lhs.terms.get(y)).toBe(-1);

    const c3 = x.eq(y, "c3");
    expect(c3.sense).toBe("==");
    expect(c3.rhs).toBe(0);
  });
});
