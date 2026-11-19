import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Model,
  expr,
  max,
  min,
  abs,
  at,
  sum,
  dot,
  maximize,
  minimize,
  implies,
  not,
  and,
  or,
  xor,
} from "../src/index.js";
import "../src/modeler/solvers/glpk.js";
import "../src/modeler/solvers/pumpkin.js";
import { registerZ3Solver, killZ3Threads } from "../src/modeler/solvers/z3.js";

describe("Piecewise-Linear (max, min, abs) & Element (at) Primitives (Issue #262)", () => {
  beforeAll(() => {
    registerZ3Solver();
  });

  afterAll(async () => {
    await killZ3Threads();
  });

  describe("Pure LP epigraph lowering (zero binary variables in convex directions)", () => {
    it("lowers minimize(max(...) + sum(abs(...))) and max/abs <= rhs with zero binary variables on Continuous vars", async () => {
      const m = new Model("ConvexEpigraphLP");
      const endTimes = m.continuous(3, { lb: 0, ub: 50, prefix: "end" });
      const w = m.continuous(3, { lb: 0, ub: 20, prefix: "w" });
      const target = [4, 7, 10];
      const loadA = m.continuous("loadA", { lb: 0, ub: 30 });
      const loadB = m.continuous("loadB", { lb: 0, ub: 30 });
      const s1 = m.continuous("s1", { lb: 0, ub: 50 });
      const s2 = m.continuous("s2", { lb: 0, ub: 50 });
      const nextStart = m.continuous("nextStart", { lb: 0, ub: 50 });

      m.constraint(expr`${endTimes[0]} >= 6`);
      m.constraint(expr`${endTimes[1]} >= 11`);
      m.constraint(expr`${endTimes[2]} >= 9`);
      m.constraint(expr`${w[0]} >= 5`); // |5 - 4| = 1
      m.constraint(expr`${w[1]} <= 5`); // |5 - 7| = 2
      m.constraint(expr`${loadA} == 10`);
      m.constraint(expr`abs(${loadA} - ${loadB}) <= 2`, "fair_balance");
      m.constraint(expr`${loadB} <= 8`); // forces loadB = 8
      m.constraint(expr`${s1} >= 2`);
      m.constraint(expr`${s2} >= 7`);
      m.constraint(expr`max(${s1} + 5, ${s2} + 3) <= ${nextStart}`, "join_precedence");

      m.objective(
        minimize(expr`max(${endTimes}) + sum(abs(${w} - ${target})) + ${nextStart}`)
      );

      // Pure LP epigraph must introduce ZERO binary variables in generated LP
      const lp = m.toLpString();
      expect(lp).not.toMatch(/\nBinary\n/);

      for (const solver of ["highs", "glpk", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        // min max(endTimes) = 11, sum|w - target| = 1 + 2 + 0 = 3, min nextStart = max(2+5, 7+3) = 10 => 24
        expect(m.objectiveValue).toBeCloseTo(24, 5);
        expect(loadB.value).toBeCloseTo(8, 5);
        expect(nextStart.value).toBeGreaterThanOrEqual(10 - 1e-5);
        const report = m.verify();
        expect(report.valid).toBe(true);
      }
    });

    it("lowers maximize(min(...)) and min(...) >= rhs with zero binary variables", async () => {
      const m = new Model("MaxMinConvexLP");
      const x = m.continuous("x", { lb: 0, ub: 20 });
      const y = m.continuous("y", { lb: 0, ub: 20 });
      const z = m.continuous("z", { lb: 0, ub: 20 });

      m.constraint(expr`${x} + ${y} + ${z} <= 27`);
      m.constraint(expr`min(${x}, ${y}) >= 6`, "min_xy");
      m.objective(maximize(expr`min(${x}, ${y}, ${z})`));

      const lp = m.toLpString();
      expect(lp).not.toMatch(/\nBinary\n/);

      for (const solver of ["highs", "glpk", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status).toBe("Optimal");
        // x = y = z = 9 => min = 9
        expect(m.objectiveValue).toBeCloseTo(9, 5);
        expect(m.verify().valid).toBe(true);
      }
    });

    it("supports LP epigraph even on unbounded continuous variables in convex directions", async () => {
      const m = new Model("UnboundedConvexAbs");
      const x = m.continuous("x", { lb: -Infinity, ub: Infinity });
      m.constraint(expr`${x} >= 4.5`);
      m.objective(minimize(expr`abs(${x} - 1)`));

      expect(m.toLpString()).not.toMatch(/\nBinary\n/);
      const status = await m.solve({ solver: "highs" });
      expect(status).toBe("Optimal");
      expect(m.objectiveValue).toBeCloseTo(3.5, 5);
      expect(x.value).toBeCloseTo(4.5, 5);
      expect(m.verify().valid).toBe(true);
    });
  });

  describe("Element-wise containers, mappers, standalone helpers, and QuadExpr integration", () => {
    it("supports variadic, 1D/2D Array/Set/Record, mapper, and nested max(abs(...)) composition", async () => {
      const pred = { a: 10, b: 20 };
      const keys = ["a", "b"] as const;

      const m = new Model("ContainerPiecewise");
      const actual = m.integer(keys, { lb: 0, ub: 30 });
      const grid = m.integer(2, 2, { lb: 1, ub: 10, prefix: "g" });

      // expr`max(abs(${pred} - ${actual}))` + standalone max/min/abs + mapper + Set
      m.constraint(expr`${actual.a} + ${actual.b} == 26`);
      m.constraint(expr`max(${grid}) <= 5`);
      m.constraint(expr`min(${new Set([grid[0][0], grid[1][1]])}) >= 3`);

      const errVec = [expr`${pred.a} - ${actual.a}`, expr`${pred.b} - ${actual.b}`];
      const maxErrStandalone = max(errVec, (e) => abs(e));
      const exprMaxAbs = expr`max(abs(${pred} - ${actual}))`;
      // At actual.a = 12, actual.b = 14 -> diffs = -2, 6 -> max abs = 6? Wait: balanced diff: a=10-(-2)? a+b=26 -> 10-a = b-20 => a+b=30; with a+b=26 => (10-a) = -(b-20)? 10-a = 20-b => b-a=10 -> a=8, b=18 => |10-8|=2, |20-18|=2 -> min max err = 2
      expect(maxErrStandalone.toString()).toContain("max(");
      m.constraint(expr`${maxErrStandalone} <= 2`);
      m.objective(minimize(expr`${exprMaxAbs} + sum(${grid})`));

      // All integer variables -> Pumpkin, Z3, HiGHS, GLPK all solve identically
      // grid[0][0] >= 3, grid[1][1] >= 3, grid[0][1] >= 1, grid[1][0] >= 1 => min sum(grid) = 8
      // min exprMaxAbs = 2 => total = 10
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(10, 5);
        expect(exprMaxAbs.value).toBeCloseTo(2, 5);
        expect(m.verify().valid).toBe(true);
      }
    });

    it("supports constant folding and QuadExpr + abs in convex objectives", async () => {
      // Constant folding
      expect(abs(-7.5).constant).toBe(7.5);
      expect(abs(-7.5).nonlinearTerms.length).toBe(0);
      expect(max(1, [4, 2], { a: 9, b: 3 }).constant).toBe(9);
      expect(min(5, [4, 2], { a: 9, b: 3 }).constant).toBe(2);

      // QuadExpr + abs on HiGHS
      const m = new Model("QuadPlusAbs");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      const y = m.continuous("y", { lb: 0, ub: 10 });
      m.constraint(expr`${x} + ${y} >= 4`);
      m.objective(minimize(expr`${x}^2 + abs(${y} - 3)`));

      const status = await m.solve({ solver: "highs" });
      expect(status).toBe("Optimal");
      // If y = 3, x = 1 => 1^2 + 0 = 1; derivative of x^2 at x=1 is 2 > 1 (slope of |y-3| is 1),
      // so x = 0.5, y = 3.5 gives 0.25 + 0.5 = 0.75 (optimal!)
      expect(m.objectiveValue).toBeCloseTo(0.75, 5);
      expect(x.value).toBeCloseTo(0.5, 4);
      expect(y.value).toBeCloseTo(3.5, 4);
      expect(m.verify().valid).toBe(true);
    });

    it("supports nested piecewise expressions inside abs(max(...) - c)", async () => {
      const m = new Model("NestedPiecewise");
      const x = m.integer("x", { lb: 0, ub: 10 });
      const y = m.integer("y", { lb: 0, ub: 10 });

      m.constraint(expr`abs(max(${x}, ${y}) - 5) <= 1`);
      m.objective(maximize(expr`${x} + ${y}`));

      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        // max(x, y) <= 6 => x = 6, y = 6 => obj = 12
        expect(m.objectiveValue).toBeCloseTo(12, 5);
        expect(m.verify().valid).toBe(true);
      }
    });
  });

  describe("Non-convex piecewise contexts (bounded MIP vs Pumpkin vs Z3) & unbounded rejection", () => {
    it("achieves exact cross-solver parity on maximize(abs), maximize(max), minimize(min), max >= rhs, abs == rhs", async () => {
      const m = new Model("NonConvexPiecewise");
      const x = m.integer("x", { lb: -3, ub: 5 });
      const y = m.integer("y", { lb: 1, ub: 6 });
      const z = m.integer("z", { lb: 0, ub: 8 });

      // |x| == 3 -> x in {-3, 3}
      m.constraint(expr`abs(${x}) == 3`, "abs_eq");
      // max(x, y) >= 5
      m.constraint(expr`max(${x}, ${y}) >= 5`, "max_ge");
      // min(y, z) <= 4
      m.constraint(expr`min(${y}, ${z}) <= 4`, "min_le");

      // Maximize -2*x + y + min(y, z) -> pick x = -3 (+6), y = 6 (+6), z = 4 (min=4) => 16
      m.objective(maximize(expr`-2 * ${x} + ${y} + min(${y}, ${z})`));

      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue, `solver=${solver}`).toBeCloseTo(16, 5);
        expect(x.value, `solver=${solver}`).toBe(-3);
        expect(y.value, `solver=${solver}`).toBe(6);
        expect(m.verify().valid, `solver=${solver}`).toBe(true);
      }
    });

    it("supports piecewise constraints inside logical formulas (implies, not, xor)", async () => {
      const m = new Model("PiecewiseInLogic");
      const flag = m.bool("flag");
      const a = m.integer("a", { lb: 0, ub: 10 });
      const b = m.integer("b", { lb: 0, ub: 10 });

      m.constraint(implies(flag, expr`max(${a}, ${b}) <= 4`), "flag_cap");
      m.constraint(not(expr`abs(${a} - ${b}) <= 2`), "must_differ_by_gt2");
      m.constraint(flag);
      m.objective(maximize(expr`${a} + ${b}`));

      // max(a,b) <= 4 and |a-b| >= 3 -> (4, 1) or (1, 4) => obj = 5
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(5, 5);
        expect(m.verify().valid).toBe(true);
      }
    });

    it("honestly rejects unbounded variables in non-convex piecewise contexts on MIP and Pumpkin", async () => {
      const m = new Model("UnboundedNonConvex");
      const x = m.continuous("x", { lb: -Infinity, ub: Infinity });
      m.constraint(expr`abs(${x}) >= 2`);
      m.objective(minimize(expr`${x}`));

      await expect(m.solve({ solver: "highs" })).rejects.toThrow(/bound/i);

      const mInt = new Model("UnboundedIntNonConvex");
      const y = mInt.integer("y", { lb: 0 }); // ub = Infinity
      mInt.constraint(expr`max(${y}, 3) >= 4`);
      mInt.objective(minimize(y));
      await expect(mInt.solve({ solver: "highs" })).rejects.toThrow(/bound/i);
      await expect(mInt.solve({ solver: "pumpkin" })).rejects.toThrow(/bound|finite/i);
    });
  });

  describe("0-based variable-indexed lookup: at(array, index)", () => {
    it("evaluates constant and variable array lookups identically across HiGHS, GLPK, Pumpkin, and Z3", async () => {
      const routeCosts = [18, 12, 25, 15];
      const m = new Model("RoutingAt");
      const baseFee = m.integer("baseFee", { lb: 5, ub: 20 });
      const selectedRoute = m.integer("selectedRoute", { lb: 0, ub: 10 }); // upper bound > array.length - 1!
      const dynBonuses = m.integer(4, { lb: 0, ub: 10, prefix: "b" });

      m.constraint(expr`${dynBonuses[1]} >= 4`);
      m.constraint(expr`${dynBonuses[3]} >= 1`);
      m.constraint(expr`${selectedRoute} >= 1`);
      // Objective has ZERO linear terms, only nonlinear `at` + linear `baseFee` -> test `at` alone too!
      m.objective(minimize(expr`${baseFee} + at(${routeCosts}, ${selectedRoute}) + at(${dynBonuses}, ${selectedRoute})`));

      // Route 1: cost=12 + bonus>=4 = 16; Route 3: cost=15 + bonus>=1 = 16; Route 2: 25
      // With baseFee = 5, optimal = 5 + 16 = 21!
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(21, 5);
        expect(selectedRoute.value).toBeGreaterThanOrEqual(0);
        expect(selectedRoute.value).toBeLessThan(routeCosts.length);
        expect(m.verify().valid).toBe(true);
      }
    });

    it("handles pure at(...) objective with zero linear Var terms across all solvers including Z3", async () => {
      const costs = [30, 10, 20];
      const m = new Model("PureAtObjective");
      const idx = m.integer("idx", { lb: 0, ub: 5 });
      m.objective(minimize(expr`at(${costs}, ${idx})`));

      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(10, 5);
        expect(idx.value).toBe(1);
        expect(m.verify().valid).toBe(true);
      }
    });

    it("enforces 0 <= index < array.length automatically (even on length-1 or constant-value arrays) and detects violations", async () => {
      // Single-element array with index forced out of range -> Infeasible / Unsat with named conflict
      const m = new Model("AtBoundsCheck");
      const idx = m.integer("idx", { lb: 0, ub: 5 });
      m.constraint(expr`${idx} >= 1`, "force_oob");
      m.constraint(expr`at(${[42]}, ${idx}) == 42`, "single_lookup");

      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const res = await m.check({ solver });
        expect(res.status, `solver=${solver}`).toBe("Unsat");
        if (solver === "highs") {
          expect(res.conflicts!.length).toBeGreaterThanOrEqual(1);
          expect(["force_oob", "single_lookup"]).toContain(res.conflicts![0]);
        } else {
          expect(res.conflicts).toEqual(expect.arrayContaining(["force_oob", "single_lookup"]));
        }
      }

      // Out-of-bounds manual assignment in verify() must report invalid
      const mVal = new Model("ValidateAtOOB");
      const idxV = mVal.integer("idxV", { lb: 0, ub: 5 });
      mVal.constraint(expr`at(${[10, 10]}, ${idxV}) == 10`, "lookup_c");
      const badReport = mVal.verify({ values: { idxV: 3 } });
      expect(badReport.valid).toBe(false);
    });

    it("rejects Continuous or fractional index, empty arrays, and quadratic expressions in at()", () => {
      const m = new Model("InvalidAt");
      const cont = m.continuous("cont", { lb: 0, ub: 3 });
      const idx = m.integer("idx", { lb: 0, ub: 3 });

      expect(() => at([10, 20], cont)).toThrow(/Continuous|integer/i);
      expect(() => expr`at(${[10, 20]}, ${cont})`).toThrow(/Continuous|integer/i);
      expect(() => at([10, 20], 0.5)).toThrow(/integer/i);
      expect(() => at([10, 20], expr`0.5 * ${idx}`)).toThrow(/integer/i);
      expect(() => at([], idx)).toThrow(/at least 1|empty/i);
    });

    it("enforces at() index bounds inside logical constraints and reports single violation on nested objective at()", async () => {
      const mLogic = new Model("AtInsideImplies");
      const flag = mLogic.bool("flag");
      const idx = mLogic.integer("idx", { lb: 0, ub: 5 });
      mLogic.constraint(implies(flag, expr`at(${[10, 20]}, ${idx}) <= 15`), "cond_at");

      // Both flag=true and flag=false with out-of-range idx=4 must be complete=true, valid=false, logical_constraint violation
      const rTrue = mLogic.verify({ values: { flag: true, idx: 4 } });
      expect(rTrue.complete).toBe(true);
      expect(rTrue.valid).toBe(false);
      expect(rTrue.uncheckedConstraints).toEqual([]);
      expect(rTrue.violations.some((v) => v.type === "logical_constraint" && v.name === "cond_at")).toBe(true);

      const rFalse = mLogic.verify({ values: { flag: false, idx: 4 } });
      expect(rFalse.complete).toBe(true);
      expect(rFalse.valid).toBe(false);
      expect(rFalse.uncheckedConstraints).toEqual([]);
      expect(rFalse.violations.some((v) => v.type === "logical_constraint" && v.name === "cond_at")).toBe(true);

      // Matching solver parity: forcing idx >= 2 is Unsat even with !flag
      const mUnsat = new Model("AtInsideImpliesUnsat");
      const fU = mUnsat.bool("fU");
      const idxU = mUnsat.integer("idxU", { lb: 4, ub: 4 });
      mUnsat.constraint(fU.not(), "flag_false");
      mUnsat.constraint(implies(fU, expr`at(${[10, 20]}, ${idxU}) <= 15`), "cond_at_u");
      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const res = await mUnsat.check({ solver });
        expect(res.status, `solver=${solver}`).toBe("Unsat");
      }

      // Nested objective at([at([10, 20], idx), 30], 0) with out-of-range inner idx must report 1 violation (no duplicates)
      const mObj = new Model("NestedObjAt");
      const idxO = mObj.integer("idxO", { lb: 0, ub: 5 });
      mObj.objective(minimize(at([at([10, 20], idxO), 30], 0)));
      const rObj = mObj.verify({ values: { idxO: 4 } });
      expect(rObj.complete).toBe(true);
      expect(rObj.valid).toBe(false);
      expect(rObj.violations).toHaveLength(1);
      expect(rObj.violations[0].name).toBe("objective_at");
    });
  });

  describe("Negative/Error guards for scalar helpers", () => {
    it("rejects empty max/min, quadratic terms inside piecewise helpers, and variable * abs(y)", () => {
      const m = new Model("Guards");
      const x = m.continuous("x", { lb: 0, ub: 5 });
      const y = m.continuous("y", { lb: 0, ub: 5 });

      expect(() => max([])).toThrow(/at least one/i);
      expect(() => min([])).toThrow(/at least one/i);
      expect(() => abs(expr`${x} * ${y}` as any)).toThrow(/quadratic/i);
      expect(() => expr`${x} * abs(${y})`).toThrow(/nonlinear|scalar/i);
      expect(() => expr`abs(${y})^2`).toThrow(/nonlinear|scalar/i);
    });
  });
});
