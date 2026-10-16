import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Model,
  Var,
  expr,
  maximize,
  minimize,
  HighsSolver,
  MockSolver,
  solveLpWithHighs,
  type Solver,
} from "../src/index.js";
import { GLPKSolver } from "../src/modeler/solvers/glpk/index.js";
import { Z3Solver, killZ3Threads } from "../src/modeler/solvers/z3/index.js";

describe("Primal Initial Values / MIP Warm Starts (Issue #48)", () => {
  beforeAll(async () => {
    await import("../src/modeler/solvers/glpk/index.js");
    await import("../src/modeler/solvers/z3/index.js");
  });

  afterAll(async () => {
    await killZ3Threads();
  });

  describe("1. Public API, constructors, and Var.initialValue vs Var.value separation", () => {
    it("accepts initialValue in Var constructor and Model numeric variable factories", () => {
      const standalone = new Var({ name: "s", type: "Continuous", lb: -5, ub: 5, initialValue: -0 });
      expect(standalone.initialValue).toBe(0);
      expect(Object.is(standalone.initialValue, 0)).toBe(true);
      expect(standalone.value).toBeNull();

      const m = new Model("ConstructorInitialValues");
      const c = m.continuous("c", { lb: 0, ub: 10, initialValue: 4.25 });
      const i = m.integer("i", { lb: -3, ub: 10, initialValue: -2 });
      const b = m.binary("b", { initialValue: 1 });

      const cVec = m.continuous(3, { lb: 0, ub: 5, initialValue: 2.5, prefix: "cv" });
      const iRec = m.integer(["a", "b"] as const, { lb: 0, ub: 10, initialValue: 7, prefix: "ir" });
      const bGrid = m.binary(2, 2, { initialValue: 0, prefix: "bg" });

      expect(c.initialValue).toBe(4.25);
      expect(i.initialValue).toBe(-2);
      expect(b.initialValue).toBe(1);
      expect(cVec.map((v) => v.initialValue)).toEqual([2.5, 2.5, 2.5]);
      expect(iRec.a.initialValue).toBe(7);
      expect(iRec.b.initialValue).toBe(7);
      expect(bGrid[0][0].initialValue).toBe(0);
      expect(bGrid[1][1].initialValue).toBe(0);

      for (const v of m.variables) {
        expect(v.value).toBeNull();
      }
    });

    it("keeps Var.initialValue distinct from Var.value across solve(), check(), resetSolutionState(), and mutations", async () => {
      const m = new Model("DistinctLifecycle");
      // Hint x = 2, but unique optimal solution is x = 8, y = 2
      const x = m.integer("x", { lb: 0, ub: 8, initialValue: 2 });
      const y = m.continuous("y", { lb: 0, ub: 5 });
      m.objective(maximize(expr`2 * ${x} + ${y}`));
      m.constraint(expr`${x} + ${y} <= 10`, "cap");

      expect(x.initialValue).toBe(2);
      expect(x.value).toBeNull();
      expect(y.initialValue).toBeUndefined();
      expect(y.value).toBeNull();

      const status = await m.solve();
      expect(status).toBe("Optimal");
      expect(x.value).toBe(8);
      expect(y.value).toBe(2);
      // initialValue must NOT be overwritten by solved value
      expect(x.initialValue).toBe(2);
      expect(y.initialValue).toBeUndefined();

      // Setting identical initialValue is a no-op and preserves solved state
      x.initialValue = 2;
      expect(m.status).toBe("Optimal");
      expect(x.value).toBe(8);

      // Resetting solution state clears Var.value but preserves Var.initialValue
      m.resetSolutionState();
      expect(m.status).toBe("NotSolved");
      expect(x.value).toBeNull();
      expect(x.initialValue).toBe(2);

      // Solve again and then mutate initialValue: clears solved state while keeping new initialValue
      await m.solve();
      expect(x.value).toBe(8);
      x.initialValue = 5;
      expect(m.status).toBe("NotSolved");
      expect(x.value).toBeNull();
      expect(x.initialValue).toBe(5);

      // Clearing initialValue via undefined
      x.initialValue = undefined;
      expect(x.initialValue).toBeUndefined();
      const checkRes = await m.check();
      expect(checkRes.status).toBe("Sat");
      expect(x.initialValue).toBeUndefined();
    });

    it("invalidates in-flight solve() and check() when Var.initialValue is mutated mid-flight", async () => {
      const m = new Model("MidFlightInitialValueMutation", {
        solver: new MockSolver({
          delayMs: 30,
          status: "Optimal",
          objectiveValue: 10,
          values: { x: 10 },
        }),
      });
      const x = m.continuous("x", { lb: 0, ub: 10, initialValue: 1 });
      m.objective(maximize(x));

      const solvePromise = m.solve();
      x.initialValue = 4;
      await expect(solvePromise).rejects.toThrow(/modified while solve\(\) was in progress/);
      expect(m.status).toBe("NotSolved");
      expect(x.value).toBeNull();
      expect(x.initialValue).toBe(4);

      const checkPromise = m.check();
      x.initialValue = 6;
      await expect(checkPromise).rejects.toThrow(/modified while check\(\) was in progress/);
      expect(m.status).toBe("NotSolved");
      expect(x.value).toBeNull();
      expect(x.initialValue).toBe(6);
    });
  });

  describe("2. Validation of initialValue (finiteness, bounds, integrality, and 1e-6 tolerance)", () => {
    it("rejects non-finite, out-of-bounds, and non-integral initialValue at construction time", () => {
      const m = new Model("ValidationAtCreation");

      expect(() => m.continuous("nan_v", { initialValue: NaN })).toThrow(
        /Variable "nan_v" has invalid initialValue: NaN/
      );
      expect(() => m.continuous("inf_v", { initialValue: Infinity })).toThrow(
        /Variable "inf_v" has invalid initialValue: Infinity/
      );
      expect(() => m.continuous("neginf_v", { lb: -Infinity, initialValue: -Infinity })).toThrow(
        /Variable "neginf_v" has invalid initialValue: -Infinity/
      );

      // Out of bounds beyond 1e-6 tolerance
      expect(() => m.continuous("below_lb", { lb: 0, ub: 10, initialValue: -1e-5 })).toThrow(
        /Variable "below_lb" has initialValue \(-0\.00001\) outside its bounds \[0, 10\]/
      );
      expect(() => m.continuous("above_ub", { lb: 0, ub: 10, initialValue: 10.00001 })).toThrow(
        /Variable "above_ub" has initialValue \(10\.00001\) outside its bounds \[0, 10\]/
      );

      // Integer & Binary domain violations
      expect(() => m.integer("frac_int", { lb: 0, ub: 10, initialValue: 2.5 })).toThrow(
        /Variable "frac_int" of type "Integer" has non-integral or out-of-domain initialValue: 2\.5/
      );
      expect(() => m.binary("frac_bin", { initialValue: 0.5 })).toThrow(
        /Variable "frac_bin" of type "Binary" has non-integral or out-of-domain initialValue: 0\.5/
      );
      expect(() => m.binary("oob_bin", { initialValue: 2 })).toThrow(
        /Variable "oob_bin" has initialValue \(2\) outside its bounds \[0, 1\]/
      );

      // Integer variable with fractional bounds where nearest integer is outside [lb, ub]
      expect(() => m.integer("tight_int", { lb: 1 + 1e-7, ub: 3, initialValue: 1 })).toThrow(
        /Variable "tight_int" of type "Integer" has non-integral or out-of-domain initialValue: 1/
      );

      // Failed creation must not leave partial variables registered in model
      expect(m.variables).toHaveLength(0);
    });

    it("accepts values within 1e-6 tolerance and normalizes them for solver consumption", async () => {
      const m = new Model("ToleranceAcceptance");
      const b = m.binary("b", { initialValue: 1 - 5e-7 });
      const i = m.integer("i", { lb: 0, ub: 5, initialValue: 3 + 4e-7 });
      const c = m.continuous("c", { lb: 2, ub: 8, initialValue: 2 - 5e-7 });
      m.objective(maximize(expr`${b} + ${i} + ${c}`));
      m.constraint(expr`${b} + ${i} + ${c} <= 10`, "cap");

      const status = await m.solve("highs");
      expect(status).toBe("Optimal");
      expect(m.validateSolution().valid).toBe(true);
    });

    it("catches invalid post-construction Var.initialValue mutations before solve(), check(), and toLpString()", async () => {
      const m = new Model("PostMutationValidation");
      const x = m.integer("x", { lb: 0, ub: 5 });
      m.objective(maximize(x));

      x.initialValue = 1.25;
      expect(() => m.validateIntegrity()).toThrow(
        /Variable "x" of type "Integer" has non-integral or out-of-domain initialValue: 1\.25/
      );
      expect(() => m.toLpString()).toThrow(
        /Variable "x" of type "Integer" has non-integral or out-of-domain initialValue: 1\.25/
      );
      await expect(m.solve("highs")).rejects.toThrow(
        /Variable "x" of type "Integer" has non-integral or out-of-domain initialValue: 1\.25/
      );
      await expect(m.check("highs")).rejects.toThrow(
        /Variable "x" of type "Integer" has non-integral or out-of-domain initialValue: 1\.25/
      );
    });

    it("rejects non-finite or unknown column initialValues passed directly to solveLpWithHighs", async () => {
      const lp = "Maximize\n obj: x\nSubject To\n c1: x <= 5\nBounds\n 0 <= x <= 5\nEnd\n";
      await expect(
        solveLpWithHighs(lp, { initialValues: { x: NaN } })
      ).rejects.toThrow(/Invalid initial value for column "x": NaN/);
      await expect(
        solveLpWithHighs(lp, { initialValues: { unknown_col: NaN } })
      ).rejects.toThrow(/Invalid initial value for column "unknown_col": NaN/);
      await expect(
        solveLpWithHighs(lp, { initialValues: { unknown_col: 1 } })
      ).rejects.toThrow(/Unknown column "unknown_col" in initialValues/);
    });
  });

  describe("3. Real HiGHS warm-start execution, native column mapping, and rebuilt MIP workflow", () => {
    it("steers tie-breaking on a symmetric MIP with both complete and partial starts", async () => {
      function buildSymmetricModel() {
        const m = new Model("SymmetricTieBreak");
        const x1 = m.binary("x1");
        const x2 = m.binary("x2");
        const x3 = m.binary("x3");
        const x4 = m.binary("x4");
        m.objective(maximize(expr`10 * ${x1} + 10 * ${x2} + 10 * ${x3} + 10 * ${x4}`));
        m.constraint(expr`${x1} + ${x2} + ${x3} + ${x4} <= 2`, "total");
        m.constraint(expr`${x1} + ${x2} >= 1`, "pair1");
        m.constraint(expr`${x3} + ${x4} >= 1`, "pair2");
        return { m, x1, x2, x3, x4 };
      }

      // 1. Baseline without start -> HiGHS picks [0, 1, 1, 0]
      const base = buildSymmetricModel();
      expect(await base.m.solve({ presolve: "off" })).toBe("Optimal");
      expect([base.x1.value, base.x2.value, base.x3.value, base.x4.value]).toEqual([0, 1, 1, 0]);

      // 2. Complete start [1, 0, 0, 1] -> HiGHS accepts dense start and returns [1, 0, 0, 1]
      const complete = buildSymmetricModel();
      complete.x1.initialValue = 1;
      complete.x2.initialValue = 0;
      complete.x3.initialValue = 0;
      complete.x4.initialValue = 1;
      expect(await complete.m.solve({ presolve: "off" })).toBe("Optimal");
      expect([
        complete.x1.value,
        complete.x2.value,
        complete.x3.value,
        complete.x4.value,
      ]).toEqual([1, 0, 0, 1]);

      // 3. Partial start with only x1=1, x4=1 -> HiGHS completes sparse start and returns [1, 0, 0, 1]
      const partialA = buildSymmetricModel();
      partialA.x1.initialValue = 1;
      partialA.x4.initialValue = 1;
      expect(await partialA.m.solve({ presolve: "off" })).toBe("Optimal");
      expect([
        partialA.x1.value,
        partialA.x2.value,
        partialA.x3.value,
        partialA.x4.value,
      ]).toEqual([1, 0, 0, 1]);

      // 4. Alternative partial start x2=1, x4=1 -> HiGHS returns [0, 1, 0, 1]
      const partialB = buildSymmetricModel();
      partialB.x2.initialValue = 1;
      partialB.x4.initialValue = 1;
      expect(await partialB.m.solve({ presolve: "off" })).toBe("Optimal");
      expect([
        partialB.x1.value,
        partialB.x2.value,
        partialB.x3.value,
        partialB.x4.value,
      ]).toEqual([0, 1, 0, 1]);
    });

    it("maps initialValue to the correct native HiGHS column when variable creation order differs from LP order and names are sanitized", async () => {
      const m = new Model("ColumnOrderAndSanitization");
      // Register variables in reverse order of LP appearance and with hyphenated names that require LP sanitization
      const v4 = m.binary("item-4", { initialValue: 1 });
      const v3 = m.binary("item-3");
      const v2 = m.binary("item-2");
      const v1 = m.binary("item-1", { initialValue: 1 });
      // Unused default-bounded continuous variable with initialValue must also be emitted in LP Bounds
      const unused = m.continuous("unused-cont", { lb: 0, initialValue: 3.5 });

      // Objective lists v1 first, so LP column 0 is item_1 while m.variables[0] is item-4
      m.objective(maximize(expr`10 * ${v1} + 10 * ${v2} + 10 * ${v3} + 10 * ${v4}`));
      m.constraint(expr`${v1} + ${v2} + ${v3} + ${v4} <= 2`, "total");
      m.constraint(expr`${v1} + ${v2} >= 1`, "pair1");
      m.constraint(expr`${v3} + ${v4} >= 1`, "pair2");

      expect(m.toLpString()).toContain("unused_cont >= 0");

      const status = await m.solve({ presolve: "off" });
      expect(status).toBe("Optimal");
      expect([v1.value, v2.value, v3.value, v4.value]).toEqual([1, 0, 0, 1]);
      expect(unused.value).toBeDefined();
      expect(m.validateSolution().valid).toBe(true);
    });

    it("supports transferring values by stable names to a rebuilt MIP model with new unhinted variables", async () => {
      // Phase 1: Solve initial model
      const m1 = new Model("Phase1MIP");
      const keys = ["lineA", "lineB", "lineC"] as const;
      const x1 = m1.integer(keys, { lb: 0, ub: 10 });
      m1.objective(maximize(expr`10 * ${x1.lineA} + 10 * ${x1.lineB} + 6 * ${x1.lineC} + 25`));
      m1.constraint(expr`${x1.lineA} + ${x1.lineB} + ${x1.lineC} <= 10`, "capacity");
      expect(await m1.solve()).toBe("Optimal");
      const prevValues = m1.solution!.values;

      // Phase 2: Rebuild model with stable names, transferring previous solution as initialValue,
      // and adding a new variable 'lineD' with no previous value (partial start)
      const m2 = new Model("Phase2RebuiltMIP");
      const x2 = {
        lineA: m2.integer("lineA", { lb: 0, ub: 10, initialValue: prevValues.lineA }),
        lineB: m2.integer("lineB", { lb: 0, ub: 10, initialValue: prevValues.lineB }),
        lineC: m2.integer("lineC", { lb: 0, ub: 10, initialValue: prevValues.lineC }),
        lineD: m2.integer("lineD", { lb: 0, ub: 5 }), // Missing hint allowed
      };
      m2.objective(
        maximize(expr`10 * ${x2.lineA} + 10 * ${x2.lineB} + 6 * ${x2.lineC} + 12 * ${x2.lineD} + 25`)
      );
      m2.constraint(
        expr`${x2.lineA} + ${x2.lineB} + ${x2.lineC} + ${x2.lineD} <= 12`,
        "expanded_capacity"
      );

      const progressEvents: number[] = [];
      const status2 = await m2.solve({
        onProgress: (ev) => {
          progressEvents.push(ev.elapsedSeconds);
        },
      });
      expect(status2).toBe("Optimal");
      // 5 * 12 (lineD=5) + 7 * 10 (lineA+lineB=7) + 25 (constant offset) = 155
      expect(m2.objectiveValue).toBeCloseTo(155, 6);
      expect(x2.lineD.value).toBe(5);
      expect(x2.lineA.value! + x2.lineB.value!).toBe(7);
      expect(x2.lineA.initialValue).toBe(prevValues.lineA);
      expect(x2.lineD.initialValue).toBeUndefined();
      expect(m2.validateSolution().valid).toBe(true);
    });

    it("treats initialValue as a hint only: does not fix variables and recovers from constraint-violating starts", async () => {
      // 1. Suboptimal feasible start does not fix variable
      const mSub = new Model("SuboptimalStart");
      const x = mSub.integer("x", { lb: 0, ub: 10, initialValue: 1 });
      mSub.objective(maximize(expr`5 * ${x}`));
      mSub.constraint(expr`${x} <= 8`, "cap");
      expect(await mSub.solve({ presolve: "off" })).toBe("Optimal");
      expect(x.value).toBe(8);
      expect(x.initialValue).toBe(1);

      // 2. Constraint-violating start (x1=1, x2=1 violates x1 + x2 <= 1) is rejected/repaired by HiGHS, not a validation error
      const mInfeasStart = new Model("ConstraintViolatingStart");
      const y1 = mInfeasStart.binary("y1", { initialValue: 1 });
      const y2 = mInfeasStart.binary("y2", { initialValue: 1 });
      mInfeasStart.objective(maximize(expr`20 * ${y1} + 10 * ${y2}`));
      mInfeasStart.constraint(expr`${y1} + ${y2} <= 1`, "mutex");
      expect(await mInfeasStart.solve({ presolve: "off" })).toBe("Optimal");
      expect(y1.value).toBe(1);
      expect(y2.value).toBe(0);
      expect(mInfeasStart.validateSolution().valid).toBe(true);
    });
  });

  describe("4. Unsupported solver capability checks", () => {
    it("declares supportsWarmStart accurately across built-in solver adapters", () => {
      expect(HighsSolver.capabilities.supportsWarmStart).toBe(true);
      expect(new HighsSolver().capabilities.supportsWarmStart).toBe(true);
      expect(GLPKSolver.capabilities.supportsWarmStart).toBe(false);
      expect(new GLPKSolver().capabilities.supportsWarmStart).toBe(false);
      expect(new Z3Solver().capabilities.supportsWarmStart).toBe(false);
      expect(new MockSolver().capabilities.supportsWarmStart).toBe(true);
    });

    it("throws a clear unsupported-capability error on GLPK, Z3, and custom solvers without supportsWarmStart in both solve() and check()", async () => {
      const m = new Model("UnsupportedWarmStartModel");
      const x = m.integer("x", { lb: 0, ub: 10, initialValue: 3 });
      m.objective(minimize(x));
      m.constraint(expr`${x} >= 2`, "min_x");

      await expect(m.solve("glpk")).rejects.toThrow(
        /Solver "GLPK" does not support primal initial values \(initialValue\)/
      );
      await expect(m.check("glpk")).rejects.toThrow(
        /Solver "GLPK" does not support primal initial values \(initialValue\)/
      );
      await expect(m.solve("z3")).rejects.toThrow(
        /Solver "z3" does not support primal initial values \(initialValue\)/
      );
      await expect(m.check("z3")).rejects.toThrow(
        /Solver "z3" does not support primal initial values \(initialValue\)/
      );

      const customNoWarmStart: Solver = {
        name: "CustomNoWarm",
        capabilities: { supportsMIP: true, supportsWarmStart: false },
        async solve() {
          return { status: "Optimal", objectiveValue: 2, values: { x: 2 } };
        },
      };
      await expect(m.solve(customNoWarmStart)).rejects.toThrow(
        /Solver "CustomNoWarm" does not support primal initial values \(initialValue\)/
      );
      await expect(m.check(customNoWarmStart)).rejects.toThrow(
        /Solver "CustomNoWarm" does not support primal initial values \(initialValue\)/
      );

      // Direct adapter entrypoint checks
      const lpData = {
        lpString: m.toLpString(),
        nameToVar: new Map([["x", x]]),
        nameToConstraint: new Map(),
      };
      const modelData = {
        name: m.name,
        sense: m.sense,
        objective: m.objectiveExpr,
        constraints: m.constraints,
        variables: m.variables,
      };
      await expect(new GLPKSolver().solve(modelData, lpData)).rejects.toThrow(
        /Solver "GLPK" does not support primal initial values \(initialValue\)/
      );
      await expect(new Z3Solver().solve(modelData, lpData)).rejects.toThrow(
        /Solver "z3" does not support primal initial values \(initialValue\)/
      );
      await expect(new Z3Solver().check(modelData)).rejects.toThrow(
        /Solver "z3" does not support primal initial values \(initialValue\)/
      );

      // Once initialValue is cleared, GLPK and Z3 solve and check normally
      x.initialValue = undefined;
      expect(await m.solve("glpk")).toBe("Optimal");
      expect(x.value).toBe(2);
      expect((await m.check("z3")).status).toBe("Sat");
    });
  });
});
