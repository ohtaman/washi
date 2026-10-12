import { describe, it, expect } from "vitest";
import { Model } from "../src/modeler/model.js";
import { BoolVar, and, or, not, implies, xor } from "../src/modeler/boolean-expr.js";
import "../src/modeler/solvers/glpk/index.js";
import "../src/modeler/solvers/z3/index.js";

describe("Boolean Expressions & SMT / SAT Logic AST", () => {
  it("creates BoolVar and evaluates logical connectives", () => {
    const a = new BoolVar("a");
    const b = new BoolVar("b");

    // a and b
    const exprAnd = a.and(b);
    expect(exprAnd.op).toBe("and");
    expect(exprAnd.children).toEqual([a, b]);

    // a or b
    const exprOr = or(a, b);
    expect(exprOr.op).toBe("or");

    // not a
    const exprNot = not(a);
    expect(exprNot.op).toBe("not");
    expect(exprNot.children).toEqual([a]);

    // a implies b
    const exprImp = a.implies(b);
    expect(exprImp.op).toBe("implies");
    expect(exprImp.children).toEqual([a, b]);

    // a xor b
    const exprXor = xor(a, b);
    expect(exprXor.op).toBe("xor");
  });

  it("combines arithmetic constraints with logical operators", () => {
    const m = new Model("LogicModel");
    const x = m.integer("x", { lb: 0 });
    const y = m.integer("y", { lb: 0 });
    const flag = m.bool("flag");

    // (x <= 5) implies (y >= 10)
    const rule1 = x.le(5).implies(y.ge(10));
    expect(rule1.op).toBe("implies");

    // flag or (x >= 20)
    const rule2 = flag.or(x.ge(20));
    expect(rule2.op).toBe("or");

    // not(flag and (y == 0))
    const rule3 = not(flag.and(y.eq(0)));
    expect(rule3.op).toBe("not");

    m.constrain(rule1, "rule1");
    m.constrain(rule2, "rule2");
    m.constrain(rule3, "rule3");

    expect(m.logicalConstraints.length).toBe(3);
  });

  it("supports m.check() with linear constraints using HiGHS/GLPK", async () => {
    // Pure linear feasibility problem (satisfiability check without objective)
    const m = new Model("FeasibilityCheck");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });

    m.constrain(x.add(y).eq(15), "sum_15");
    m.constrain(x.ge(6), "x_ge_6");

    // HiGHS solve feasibility
    const res = await m.check({ solver: "highs" });
    expect(res.status).toBe("Sat");
    expect(res.values["x"]).toBeGreaterThanOrEqual(6);
    expect((res.values["x"] as number) + (res.values["y"] as number)).toBeCloseTo(15, 4);

    // Infeasible case
    const mInf = new Model("InfeasibleCheck");
    const v = mInf.continuous("v");
    mInf.constrain(v.ge(10), "v_ge_10");
    mInf.constrain(v.le(5), "v_le_5");

    const resInf = await mInf.check({ solver: "highs" });
    expect(resInf.status).toBe("Unsat");
  });

  it("guards against logical constraints when solver lacks SMT capability", async () => {
    const m = new Model("SMT_Guard");
    const x = m.continuous("x");
    const p = m.bool("p");

    // Logical constraint: p or (x >= 5)
    m.constrain(p.or(x.ge(5)));

    // HiGHS and GLPK do not support SMT native logic without translation
    await expect(m.check({ solver: "highs" })).rejects.toThrowError(
      /does not support SMT \/ logical constraints/
    );
    await expect(m.check({ solver: "glpk" })).rejects.toThrowError(
      /does not support SMT \/ logical constraints/
    );
  });

  it("guards against logical constraints in optimize() and solve() on non-SMT solvers (Issue #39)", async () => {
    // Model with logical constraint (implies)
    const createModel = (solverName: string) => {
      const m = new Model({ solver: solverName });
      const b = m.binary("b");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      m.constrain(b.eq(1));
      m.constrain(b.eq(1).implies(x.ge(5)));
      m.minimize(x);
      return { m, b, x };
    };

    // 1. HiGHS rejects optimize() and solve()
    const { m: mHighs } = createModel("highs");
    await expect(mHighs.optimize()).rejects.toThrowError(
      /does not support SMT \/ logical constraints/
    );
    await expect(mHighs.solve()).rejects.toThrowError(
      /does not support SMT \/ logical constraints/
    );

    // 2. GLPK rejects optimize() and solve()
    const { m: mGlpk } = createModel("glpk");
    await expect(mGlpk.optimize()).rejects.toThrowError(
      /does not support SMT \/ logical constraints/
    );
    await expect(mGlpk.solve()).rejects.toThrowError(
      /does not support SMT \/ logical constraints/
    );

    // 3. Counter-example: Explicit Big-M indicator constraint solves correctly on HiGHS
    const mInd = new Model({ solver: "highs" });
    const bInd = mInd.binary("b");
    const xInd = mInd.continuous("x", { lb: 0, ub: 10 });
    mInd.constrain(bInd.eq(1));
    mInd.indicator(bInd, xInd.ge(5), { activeValue: 1, M: 10 });
    mInd.minimize(xInd);

    const statusInd = await mInd.optimize();
    expect(statusInd).toBe("Optimal");
    expect(bInd.value).toBe(1);
    expect(xInd.value).toBeCloseTo(5, 4);

    // 4. SMT-capable solver (Z3) solves model with logical constraint successfully
    const { m: mZ3, b: bZ3, x: xZ3 } = createModel("z3");
    const statusZ3 = await mZ3.optimize();
    expect(statusZ3).toBe("Optimal");
    expect(bZ3.value).toBe(1);
    expect(xZ3.value).toBe(5);
    expect(mZ3.objectiveValue).toBe(5);

    // solve() alias also works on Z3
    const { m: mZ3Solve, b: bZ3Solve, x: xZ3Solve } = createModel("z3");
    const statusZ3Solve = await mZ3Solve.solve();
    expect(statusZ3Solve).toBe("Optimal");
    expect(bZ3Solve.value).toBe(1);
    expect(xZ3Solve.value).toBe(5);
  });
});

