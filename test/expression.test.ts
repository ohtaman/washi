import { describe, it, expect } from "vitest";
import { Var } from "../src/modeler/variable.js";
import { LinExpr, sum } from "../src/modeler/expression.js";
import { Model } from "../src/modeler/model.js";
import { minimize } from "../src/modeler/objective.js";
import { parseExpr } from "../src/modeler/parser.js";

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
    expect((expr as any).getValue).toBeUndefined();
  });

  it("handles sum aggregation function with iterables and mapping", () => {
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
    const s2 = sum(vars, (v, i) => v.mul(weights[i]));
    expect(s2.terms.get(x0)).toBe(10);
    expect(s2.terms.get(x1)).toBe(20);
    expect(s2.terms.get(x2)).toBe(30);

    // sum with count overload
    const s3 = sum(3, (i) => vars[i].mul((i + 1) * 2));
    expect(s3.terms.get(x0)).toBe(2);
    expect(s3.terms.get(x1)).toBe(4);
    expect(s3.terms.get(x2)).toBe(6);
  });

  it("supports 1D/2D Record and 2D Array/Iterable containers directly in sum()", () => {
    const m = new Model("SumContainers");
    const qty1D = m.integer(["desk", "chair"] as const, { lb: 0 });
    const sRec1D = sum(qty1D);
    expect(sRec1D.terms.get(qty1D.desk)).toBe(1);
    expect(sRec1D.terms.get(qty1D.chair)).toBe(1);

    // 1D Record with mapper
    const weights = { desk: 3, chair: 5 };
    const sRecMapped = sum(qty1D, (v, idx) => v.mul(idx === 0 ? weights.desk : weights.chair));
    expect(sRecMapped.terms.get(qty1D.desk)).toBe(3);
    expect(sRecMapped.terms.get(qty1D.chair)).toBe(5);

    // 2D Array
    const grid2D = m.continuous(2, 2, { prefix: "g" });
    const sArr2D = sum(grid2D);
    expect(sArr2D.terms.get(grid2D[0][0])).toBe(1);
    expect(sArr2D.terms.get(grid2D[0][1])).toBe(1);
    expect(sArr2D.terms.get(grid2D[1][0])).toBe(1);
    expect(sArr2D.terms.get(grid2D[1][1])).toBe(1);

    // 2D Record
    const ship2D = m.continuous(["F1", "F2"] as const, ["S1", "S2"] as const, { prefix: "ship" });
    const sRec2D = sum(ship2D);
    expect(sRec2D.terms.get(ship2D.F1.S1)).toBe(1);
    expect(sRec2D.terms.get(ship2D.F1.S2)).toBe(1);
    expect(sRec2D.terms.get(ship2D.F2.S1)).toBe(1);
    expect(sRec2D.terms.get(ship2D.F2.S2)).toBe(1);

    // Mixed 2D containers (Array of Records and Record of Arrays/Sets)
    const arrOfRec = m.binary(2, ["Day", "Night"] as const);
    const sArrOfRec = sum(arrOfRec);
    expect(sArrOfRec.terms.get(arrOfRec[0].Day)).toBe(1);
    expect(sArrOfRec.terms.get(arrOfRec[1].Night)).toBe(1);

    const recOfSet = {
      A: new Set([qty1D.desk, 5]),
      B: new Set([qty1D.chair, 7]),
    };
    const sRecOfSet = sum(recOfSet);
    expect(sRecOfSet.terms.get(qty1D.desk)).toBe(1);
    expect(sRecOfSet.terms.get(qty1D.chair)).toBe(1);
    expect(sRecOfSet.constant).toBe(12);

    // Records with reserved property names ('id', 'terms', 'quadTerms', 'sense', 'lhs', '__proto__')
    const specialVars = m.continuous(["id", "terms", "quadTerms", "sense", "lhs"] as const);
    const sSpecial = sum(specialVars);
    expect(sSpecial.terms.get(specialVars.id)).toBe(1);
    expect(sSpecial.terms.get(specialVars.terms)).toBe(1);
    expect(sSpecial.terms.get(specialVars.quadTerms)).toBe(1);
    expect(sSpecial.terms.get(specialVars.sense)).toBe(1);
    expect(sSpecial.terms.get(specialVars.lhs)).toBe(1);

    const protoRec = JSON.parse('{"__proto__": 2, "a": 3}') as Record<string, number>;
    expect(sum(protoRec).constant).toBe(5);

    // Mapped Iterable over a Map (regression test: Map is supported when a mapper is provided)
    const varMap = new Map<string, Var>([
      ["desk", qty1D.desk],
      ["chair", qty1D.chair],
    ]);
    const sMappedMap = sum(varMap, ([, v], idx) => v.mul(idx + 2));
    expect(sMappedMap.terms.get(qty1D.desk)).toBe(2);
    expect(sMappedMap.terms.get(qty1D.chair)).toBe(3);
    expect(() => sum(varMap as any)).toThrow(/Unsupported item in sum/);

    // Validation errors in sum()
    const sym = Symbol("s");
    expect(() => {
      // @ts-expect-error symbol keys are not supported in sum()
      sum({ [sym]: qty1D.desk });
    }).toThrow(/Symbol keys are not supported in sum/);
    expect(() => sum(-1, () => qty1D.desk)).toThrow(/non-negative integer count/);
    expect(() => sum(1.5, () => qty1D.desk)).toThrow(/non-negative integer count/);
    expect(() => sum([[[qty1D.desk]]] as any)).toThrow(/Nested containers deeper than 2D/);
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

  it("serializes retained small non-zero residual coefficients in LP export and round-trips through parseExpr", () => {
    const m = new Model("SmallCoeffLpExport");
    const x = m.continuous("x");
    const residualLin = x.mul(1).sub(x.mul(1 - 5e-13));
    const linCoeff = residualLin.terms.get(x)!;
    expect(linCoeff).toBeGreaterThan(0);
    expect(linCoeff).toBeLessThan(1e-12);

    const constrExpr = x.mul(3e-13);
    const quadObj = residualLin.add(x.mul(x).mul(4e-13));

    m.objective(minimize(quadObj));
    m.constraint(constrExpr.le(1), "c_small");

    const lp = m.toLpString();
    expect(lp).toContain(`${linCoeff} x`);
    expect(lp).toContain(`[ 8e-13 x ^ 2 ] / 2`);
    expect(lp).toContain(`c_small: 3e-13 x <= 1`);

    // Scientific notation emitted by toString() must round-trip through parseExpr()
    const resolver = (name: string) => (name === "x" ? x : undefined);
    const reparsedLin = parseExpr(residualLin.toString(), resolver) as LinExpr;
    expect(reparsedLin.terms.get(x)).toBe(linCoeff);
    const reparsedQuad = parseExpr(quadObj.toString(), resolver);
    expect("quadTerms" in reparsedQuad && reparsedQuad.getQuadCoeff(x, x)).toBe(4e-13);
  });
});
