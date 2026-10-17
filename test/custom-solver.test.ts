import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Model,
  expr,
  maximize,
  minimize,
  implies,
  generateLpString,
  buildLpSymbolMaps,
  registerSolver,
  listAvailableSolvers,
  getSolver,
  MockSolver,
  type Solver,
  type SolverOptions,
  type SolverResult,
  type SolverCheckResult,
  type SolveModelData,
  type CheckModelData,
} from "../src/index.js";
import * as lpWriter from "../src/modeler/lp-writer.js";

describe("Custom Solver Plugin Architecture & Typed Adapter Contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unregistered solver names with helpful instructions", async () => {
    const model = new Model({ name: "UnregisteredGlpk" });
    const x = model.continuous("x");
    model.objective(maximize(x));

    expect(() => getSolver("glpk")).toThrow(
      "Solver 'glpk' not found. Available solvers: highs, mock. Please import '@ohtaman/washi/solvers/glpk' before selecting this solver."
    );

    expect(() => getSolver("z3")).toThrow(
      "Solver 'z3' not found. Available solvers: highs, mock. Please import '@ohtaman/washi/solvers/z3' before selecting this solver."
    );

    expect(() => getSolver("quantum-solver")).toThrow(
      "Solver 'quantum-solver' not found. Available solvers: highs, mock"
    );
  });

  it("allows registering and executing a custom third-party solver plugin without LP serialization", async () => {
    const lpSpy = vi.spyOn(lpWriter, "generateLpString");

    class DummyThirdPartySolver implements Solver {
      public readonly name = "DummyThirdParty";
      public readonly version = "1.0.0";
      public readonly capabilities = { supportsMIP: true, supportsQP: false };
      public options: SolverOptions;

      constructor(options: SolverOptions = {}) {
        this.options = options;
      }

      async solve(
        modelData: SolveModelData,
        options: SolverOptions = {}
      ): Promise<SolverResult> {
        expect(modelData.name).toBe("ThirdPartyModel");
        expect(modelData.sense).toBe("Maximize");
        expect(modelData.variables.map((v) => v.name)).toEqual(["v_a", "v_b"]);
        expect(modelData.constraints.map((c) => c.name)).toEqual(["c_budget"]);
        expect((options as any).solver).toBeUndefined();
        return {
          status: "Optimal",
          objectiveValue: 1234.5,
          values: {
            v_a: 10,
            v_b: 20,
          },
          duals: {
            c_budget: 3.5,
          },
          slacks: {
            c_budget: 0,
          },
          runTime: 0.042,
          logs: ["DummyThirdParty solved successfully."],
        };
      }
    }

    registerSolver("dummy-3rd-party", (opts) => new DummyThirdPartySolver(opts));

    expect(listAvailableSolvers()).toContain("dummy-3rd-party");

    const m = new Model({ name: "ThirdPartyModel", solver: "dummy-3rd-party" });
    const a = m.continuous("v_a");
    const b = m.continuous("v_b");
    m.objective(maximize(a.mul(2).add(b.mul(3))));
    m.constraint(a.add(b).le(30), "c_budget");
    const c1 = m.getConstraintByName("c_budget")!;

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1234.5);
    expect(a.value).toBe(10);
    expect(b.value).toBe(20);
    expect(c1.dual).toBe(3.5);
    expect(c1.slack).toBe(0);
    expect(lpSpy).not.toHaveBeenCalled();
  });

  it("supports passing custom solver instance directly to Model", async () => {
    const inlineSolver: Solver = {
      name: "InlineSolver",
      async solve(modelData) {
        expect(modelData.variables).toHaveLength(1);
        return {
          status: "Optimal",
          objectiveValue: 999,
          values: { p_x: 42 },
          runTime: 0.001,
        };
      },
    };

    const model = new Model({ solver: inlineSolver });
    const x = model.continuous("p_x");
    model.objective(maximize(x));
    await model.solve();
    expect(x.value).toBe(42);
    expect(model.objectiveValue).toBe(999);
  });

  it("handles capability validation when solver does not support quadratic objectives", async () => {
    const linearOnlySolver: Solver = {
      name: "LinearOnly",
      capabilities: { supportsMIP: true, supportsQP: false },
      async solve() {
        return { status: "Optimal", objectiveValue: 0, values: {} };
      },
    };

    const model = new Model({ solver: linearOnlySolver });
    const x = model.continuous("x");
    // Quadratic objective x * x
    model.objective(maximize(x.mul(x)));

    await expect(model.solve()).rejects.toThrow(
      "does not support quadratic objectives"
    );
  });

  it("propagates primal values and duals into WaSHI Model using opt-in generateLpString (guide snippet)", async () => {
    class CloudSolver implements Solver {
      name = "CloudSolver";
      async solve(modelData: SolveModelData): Promise<SolverResult> {
        const { lpString } = generateLpString(modelData);
        expect(lpString).toContain("Subject To");
        return {
          status: "Optimal",
          objectiveValue: 36,
          values: { x: 0, y: 12 },
          duals: { budget: 3 },
          runTime: 0.1,
        };
      }
    }

    const model = new Model({ solver: new CloudSolver() });
    const x = model.continuous("x", { lb: 0, ub: 10 });
    const y = model.continuous("y", { lb: 0, ub: 10 });
    model.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
    model.constraint(expr`${x} + ${y} <= 12`, "budget");

    const status = await model.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(0);
    expect(y.value).toBe(12);
    const c1 = model.getConstraintByName("budget");
    expect(c1?.dual).toBe(3);
  });

  it("does not invoke generateLpString when solving or checking with GLPK, Z3, or MockSolver", async () => {
    await import("../src/modeler/solvers/glpk.js");
    await import("../src/modeler/solvers/z3.js");

    const lpSpy = vi.spyOn(lpWriter, "generateLpString");

    const m = new Model({ name: "NoLpExportTest" });
    const x = m.integer("x", { lb: 0, ub: 5 });
    const y = m.integer("y", { lb: 0, ub: 5 });
    m.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
    m.constraint(expr`${x} + ${y} <= 6`, "cap");

    // 1. MockSolver solve & check
    await m.solve(new MockSolver({ status: "Optimal", objectiveValue: 15, values: { x: 1, y: 5 } }));
    await m.check(new MockSolver({ status: "Optimal", objectiveValue: 0, values: { x: 1, y: 5 } }));
    expect(lpSpy).not.toHaveBeenCalled();

    // 2. GLPK solve & check
    const glpkStatus = await m.solve("glpk");
    expect(glpkStatus).toBe("Optimal");
    expect(m.objectiveValue).toBe(17);
    expect(x.value).toBe(1);
    expect(y.value).toBe(5);

    const glpkCheck = await m.check("glpk");
    expect(glpkCheck.status).toBe("Sat");
    expect(lpSpy).not.toHaveBeenCalled();

    // 3. Z3 solve & check
    const z3Status = await m.solve("z3");
    expect(z3Status).toBe("Optimal");
    expect(m.objectiveValue).toBe(17);

    const z3Check = await m.check("z3");
    expect(z3Check.status).toBe("Sat");
    expect(lpSpy).not.toHaveBeenCalled();

    // 4. HiGHS solve DOES call generateLpString on demand inside HighsSolver
    const highsStatus = await m.solve("highs");
    expect(highsStatus).toBe("Optimal");
    expect(lpSpy).toHaveBeenCalledTimes(1);
  });

  it("decodes colliding sanitized names ('x-1' vs 'x_1', 'c-1' vs 'c_1') across HiGHS, GLPK, Z3, and custom adapters", async () => {
    await import("../src/modeler/solvers/glpk.js");
    await import("../src/modeler/solvers/z3.js");

    const m = new Model({ name: "SanitizedCollisionTest" });
    const xDash = m.continuous("x-1", { lb: 0, ub: 10 });
    const xUnder = m.continuous("x_1", { lb: 0, ub: 10 });
    m.objective(maximize(expr`${xDash} + 10 * ${xUnder}`));
    m.constraint(expr`${xDash} <= 3`, "c-1");
    m.constraint(expr`${xUnder} <= 7`, "c_1");
    const cDash = m.getConstraintByName("c-1")!;
    const cUnder = m.getConstraintByName("c_1")!;

    // 1. HiGHS
    expect(await m.solve("highs")).toBe("Optimal");
    expect(xDash.value).toBeCloseTo(3, 5);
    expect(xUnder.value).toBeCloseTo(7, 5);
    expect(cDash.dual).toBeCloseTo(1, 5);
    expect(cUnder.dual).toBeCloseTo(10, 5);
    expect(m.solution?.values).toEqual({ "x-1": 3, x_1: 7 });

    // 2. GLPK
    expect(await m.solve("glpk")).toBe("Optimal");
    expect(xDash.value).toBeCloseTo(3, 5);
    expect(xUnder.value).toBeCloseTo(7, 5);
    expect(cDash.dual).toBeCloseTo(1, 5);
    expect(cUnder.dual).toBeCloseTo(10, 5);
    expect(m.solution?.values).toEqual({ "x-1": 3, x_1: 7 });

    // 3. Z3 solve & check
    expect(await m.solve("z3")).toBe("Optimal");
    expect(xDash.value).toBeCloseTo(3, 5);
    expect(xUnder.value).toBeCloseTo(7, 5);

    const z3Check = await m.check("z3");
    expect(z3Check.status).toBe("Sat");
    expect(z3Check.values["x-1"]).toBeLessThanOrEqual(3);
    expect(z3Check.values["x_1"]).toBeLessThanOrEqual(7);

    // 4. Custom LP adapter returning raw sanitized LP names ("x_1" for "x-1", "x_1_1" for "x_1")
    const rawSanitizedSolver: Solver = {
      name: "RawSanitizedLpSolver",
      async solve(modelData) {
        const maps = buildLpSymbolMaps(modelData);
        expect(maps.varToName.get(xDash)).toBe("x_1");
        expect(maps.varToName.get(xUnder)).toBe("x_1_1");
        expect(maps.constraintToName.get(cDash)).toBe("c_1");
        expect(maps.constraintToName.get(cUnder)).toBe("c_1_1");
        return {
          status: "Optimal",
          objectiveValue: 73,
          values: { x_1: 3, x_1_1: 7 },
          reducedCosts: { x_1: 0, x_1_1: 0 },
          duals: { c_1: 1, c_1_1: 10 },
          slacks: { c_1: 0, c_1_1: 0 },
        };
      },
    };

    expect(await m.solve(rawSanitizedSolver)).toBe("Optimal");
    expect(xDash.value).toBe(3);
    expect(xUnder.value).toBe(7);
    expect(cDash.dual).toBe(1);
    expect(cUnder.dual).toBe(10);
    expect(m.solution?.values).toEqual({ "x-1": 3, x_1: 7 });
    expect(m.solution?.duals).toEqual({ "c-1": 1, c_1: 10 });

    // 5. Partial canonical result with an extra unknown key does not misroute "x_1" to "x-1"
    const partialCanonicalSolver: Solver = {
      name: "PartialCanonicalSolver",
      async solve() {
        return {
          status: "Optimal",
          objectiveValue: 70,
          values: { x_1: 7, extra_aux: 99 },
          duals: { c_1: 10, extra_row: 1 },
        };
      },
    };
    expect(await m.solve(partialCanonicalSolver)).toBe("Optimal");
    expect(xDash.value).toBeNull();
    expect(xUnder.value).toBe(7);
    expect(cDash.dual).toBeNull();
    expect(cUnder.dual).toBe(10);
  });

  it("ignores missing and non-finite values in adapter solve() and check() results", async () => {
    const m = new Model({ name: "NonFiniteFilterTest" });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });
    const z = m.continuous("z", { lb: 0, ub: 10 });
    const flag = m.bool("flag");
    m.constraint(expr`${x} + ${y} <= 10`, "c1");
    m.constraint(expr`${y} + ${z} <= 10`, "c2");
    const c1 = m.getConstraintByName("c1")!;
    const c2 = m.getConstraintByName("c2")!;
    m.objective(maximize(expr`${x} + ${y} + ${z}`));

    const noisySolver: Solver = {
      name: "NoisySolver",
      async solve() {
        return {
          status: "Optimal",
          objectiveValue: 5,
          values: {
            x: 5,
            y: Number.NaN,
            z: Number.POSITIVE_INFINITY,
          },
          boolValues: {
            flag: true,
          },
          reducedCosts: {
            x: 0,
            y: Number.NEGATIVE_INFINITY,
            z: Number.NaN,
          },
          duals: {
            c1: 1.5,
            c2: Number.POSITIVE_INFINITY,
          },
          slacks: {
            c1: 0,
            c2: Number.NaN,
          },
        };
      },
      async check(): Promise<SolverCheckResult> {
        return {
          status: "Sat",
          values: {
            x: 4,
            y: Number.NaN,
            z: Number.POSITIVE_INFINITY,
            flag: undefined as any,
          },
        };
      },
    };

    await m.solve(noisySolver);
    expect(x.value).toBe(5);
    expect(y.value).toBeNull();
    expect(z.value).toBeNull();
    expect(flag.value).toBe(true);
    expect(x.reducedCost).toBe(0);
    expect(y.reducedCost).toBeNull();
    expect(z.reducedCost).toBeNull();
    expect(c1.dual).toBe(1.5);
    expect(c2.dual).toBeNull();
    expect(c1.slack).toBe(0);
    expect(c2.slack).toBeNull();
    expect(m.solution?.values).toEqual({ x: 5 });
    expect(m.solution?.reducedCosts).toEqual({ x: 0 });
    expect(m.solution?.duals).toEqual({ c1: 1.5 });
    expect(m.solution?.slacks).toEqual({ c1: 0 });

    const checkRes = await m.check(noisySolver);
    expect(checkRes.status).toBe("Sat");
    expect(x.value).toBe(4);
    expect(y.value).toBeNull();
    expect(z.value).toBeNull();
    expect(flag.value).toBeNull();
    expect(checkRes.values).toEqual({ x: 4 });
  });

  it("allows check() on a model with a quadratic objective using QP-incapable solvers and custom check adapters", async () => {
    await import("../src/modeler/solvers/glpk.js");
    await import("../src/modeler/solvers/z3.js");

    const m = new Model({ name: "CheckIgnoresQPObjective" });
    const x = m.integer("x", { lb: 1, ub: 5 });
    const flag = m.bool("flag");
    m.objective(minimize(x.mul(x)));
    m.constraint(expr`${x} >= 2`, "min_x");

    // 1. Custom check() adapter receives CheckModelData without objective
    const customChecker: Solver = {
      name: "CustomChecker",
      capabilities: { supportsMIP: true, supportsQP: false, supportsSMT: true },
      async solve() {
        throw new Error("solve() should not be called when check() is implemented");
      },
      async check(modelData: CheckModelData) {
        expect("objective" in modelData).toBe(false);
        expect(modelData.variables).toEqual([x]);
        expect(modelData.boolVars).toEqual([flag]);
        return {
          status: "Sat",
          values: { x: 3, flag: true },
        };
      },
    };

    const customRes = await m.check(customChecker);
    expect(customRes.status).toBe("Sat");
    expect(x.value).toBe(3);
    expect(flag.value).toBe(true);

    // 2. GLPK check() fallback uses a zero linear objective, succeeding despite QP objective on model
    const glpkRes = await m.check("glpk");
    expect(glpkRes.status).toBe("Sat");
    expect(x.value).toBeGreaterThanOrEqual(2);

    // 3. Z3 check() succeeds despite QP objective on model
    m.constraint(implies(flag, expr`${x} >= 4`), "logic_rule");
    const z3Res = await m.check("z3");
    expect(z3Res.status).toBe("Sat");
    expect(typeof flag.value).toBe("boolean");
  });

  it("does not mutate caller-owned options objects in solve() or check() and strips the routing solver key", async () => {
    let receivedSolveOpts: SolverOptions | undefined;
    let receivedCheckOpts: SolverOptions | undefined;

    registerSolver("immutable-opts-test", (factoryOpts) => {
      expect((factoryOpts as any)?.solver).toBeUndefined();
      return {
        name: "ImmutableOptsSolver",
        async solve(_modelData, opts) {
          receivedSolveOpts = opts;
          return { status: "Optimal", objectiveValue: 1, values: { x: 1 } };
        },
        async check(_modelData, opts) {
          receivedCheckOpts = opts;
          return { status: "Sat", values: { x: 1 } };
        },
      };
    });

    const m = new Model({ name: "ImmutableOptionsModel" });
    const x = m.continuous("x", { lb: 0, ub: 5 });
    m.objective(maximize(x));

    const frozenSolveOpts = Object.freeze({
      solver: "immutable-opts-test",
      timeLimit: 12,
    });
    await m.solve(frozenSolveOpts);
    expect(frozenSolveOpts.solver).toBe("immutable-opts-test");
    expect(receivedSolveOpts?.timeLimit).toBe(12);
    expect((receivedSolveOpts as any)?.solver).toBeUndefined();

    const frozenCheckOpts = Object.freeze({
      solver: "immutable-opts-test",
      timeLimit: 7,
    });
    await m.check(frozenCheckOpts);
    expect(frozenCheckOpts.solver).toBe("immutable-opts-test");
    expect(receivedCheckOpts?.timeLimit).toBe(7);
    expect((receivedCheckOpts as any)?.solver).toBeUndefined();
  });
});

