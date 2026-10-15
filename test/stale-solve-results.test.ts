import { describe, it, expect } from "vitest";
import {
  Model,
  Var,
  Constraint,
  expr,
  c,
  maximize,
  minimize,
  type Solver,
  type SolverResult,
  type CheckResult,
  type SolveOptions,
} from "../src/index.js";

function createGatedSolver(
  resultFactory: () => SolverResult,
  checkFactory?: () => CheckResult
): {
  solver: Solver;
  waitForStart: Promise<void>;
  release: () => void;
  fail: (err: Error) => void;
  emitProgress: () => void;
} {
  let resolveStart!: () => void;
  const waitForStart = new Promise<void>((r) => {
    resolveStart = r;
  });

  let releaseGate!: () => void;
  let failGate!: (err: Error) => void;
  let capturedOptions: SolveOptions | undefined;

  const gate = new Promise<void>((resolve, reject) => {
    releaseGate = resolve;
    failGate = reject;
  });

  const solver: Solver = {
    name: "gated-test-solver",
    capabilities: {
      supportsMIP: true,
      supportsQP: true,
      supportsSMT: Boolean(checkFactory),
    },
    async solve(_modelData, _lpData, options) {
      capturedOptions = options;
      resolveStart();
      await gate;
      return resultFactory();
    },
    ...(checkFactory
      ? {
          async check(_modelData, options) {
            capturedOptions = options;
            resolveStart();
            await gate;
            return checkFactory();
          },
        }
      : {}),
  };

  return {
    solver,
    waitForStart,
    release: () => releaseGate(),
    fail: (err: Error) => failGate(err),
    emitProgress: () => {
      capturedOptions?.onProgress?.({
        elapsedTime: 0.01,
      });
    },
  };
}

describe("Stale solve() and check() result prevention (Issue #77)", () => {
  it("discards stale solve() results when objective changes while solve() is in progress", async () => {
    const gated = createGatedSolver(() => ({
      status: "Optimal",
      terminationStatus: "Optimal",
      hasPrimalSolution: true,
      objectiveValue: 10,
      values: { x: 10 },
      runTime: 5,
    }));

    const m = new Model({ name: "Issue77Repro", solver: gated.solver });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.objective(maximize(x));

    const pendingSolve = m.solve();
    await gated.waitForStart;

    // Mutate objective while solve() is in flight
    m.objective(minimize(x));
    gated.release();

    await expect(pendingSolve).rejects.toThrow(
      /Model "Issue77Repro" was modified while solve\(\) was in progress; stale solver result was discarded\./
    );

    expect(m.status).toBe("NotSolved");
    expect(m.terminationStatus).toBe("NotSolved");
    expect(m.hasPrimalSolution).toBe(false);
    expect(m.objectiveValue).toBeNull();
    expect(m.solution).toBeNull();
    expect(x.value).toBeNull();
    expect(m.values.size).toBe(0);
    expect(m.validateSolution().valid).toBe(false);
  });

  it("discards stale solve() results when constraints, variables, bounds, or types change mid-flight", async () => {
    const mutations: Array<{
      label: string;
      mutate: (m: Model, x: Var, c1: Constraint) => void;
    }> = [
      {
        label: "add linear constraint",
        mutate: (m, x) => {
          m.constraint(c`${x} <= 4`, "cap");
        },
      },
      {
        label: "add continuous variable",
        mutate: (m) => {
          m.continuous("y", { lb: 0, ub: 5 });
        },
      },
      {
        label: "add boolean variable",
        mutate: (m) => {
          m.bool("flag");
        },
      },
      {
        label: "mutate variable upper bound in-place",
        mutate: (_m, x) => {
          x.ub = 3;
        },
      },
      {
        label: "mutate variable type in-place",
        mutate: (_m, x) => {
          x.type = "Binary";
        },
      },
      {
        label: "mutate constraint rhs in-place",
        mutate: (_m, _x, c1) => {
          c1.rhs = 2;
        },
      },
      {
        label: "explicit resetSolutionState()",
        mutate: (m) => {
          m.resetSolutionState();
        },
      },
    ];

    for (const { label, mutate } of mutations) {
      const gated = createGatedSolver(() => ({
        status: "Optimal",
        terminationStatus: "Optimal",
        hasPrimalSolution: true,
        objectiveValue: 8,
        values: { x: 8 },
        duals: { c_base: 1 },
        reducedCosts: { x: 0 },
        slacks: { c_base: 0 },
        runTime: 3,
      }));

      const m = new Model({ name: `Mutate_${label}`, solver: gated.solver });
      const x = m.continuous("x", { lb: 0, ub: 10 });
      const c1 = x.le(8, "c_base");
      m.constraint(c1);
      m.objective(maximize(x));

      const pending = m.solve();
      await gated.waitForStart;

      mutate(m, x, c1);
      gated.release();

      await expect(pending, `Expected rejection for ${label}`).rejects.toThrow(
        /was modified while solve\(\) was in progress; stale solver result was discarded/
      );
      expect(m.status).toBe("NotSolved");
      expect(m.solution).toBeNull();
      expect(x.value).toBeNull();
      expect(x.reducedCost).toBeNull();
      expect(c1.dual).toBeNull();
      expect(c1.slack).toBeNull();
    }
  });

  it("discards stale check() results (both native SMT and LP fallback) without clobbering mid-flight objective edits", async () => {
    // 1. Native check() adapter (e.g. Z3 style)
    const gatedNative = createGatedSolver(
      () => ({ status: "Optimal", objectiveValue: 5, values: { x: 5 }, runTime: 1 }),
      () => ({
        status: "Unsat",
        values: {},
        unsatCore: ["c1"],
        conflicts: ["c1"],
        runTime: 2,
      })
    );

    const mNative = new Model({ name: "NativeCheckModel", solver: gatedNative.solver });
    const x1 = mNative.continuous("x", { lb: 0, ub: 10 });
    mNative.constraint(c`${x1} <= 5`, "c1");

    const pendingNative = mNative.check();
    await gatedNative.waitForStart;
    mNative.constraint(c`${x1} >= 1`, "c2");
    gatedNative.release();

    await expect(pendingNative).rejects.toThrow(
      /Model "NativeCheckModel" was modified while check\(\) was in progress; stale solver result was discarded\./
    );
    expect(mNative.status).toBe("NotSolved");
    expect(mNative.unsatCore).toBeUndefined();
    expect(mNative.conflicts).toBeUndefined();

    // 2. Fallback check() adapter (LP/MIP solver without native check())
    const gatedFallback = createGatedSolver(() => ({
      status: "Optimal",
      terminationStatus: "Optimal",
      hasPrimalSolution: true,
      objectiveValue: 0,
      values: { x: 4 },
      runTime: 2,
    }));

    const mFallback = new Model({ name: "FallbackCheckModel", solver: gatedFallback.solver });
    const x2 = mFallback.continuous("x", { lb: 0, ub: 10 });
    mFallback.objective(minimize(expr`2 * ${x2} + 3`));

    const pendingFallback = mFallback.check();
    await gatedFallback.waitForStart;

    // Inspecting objective during check() must still reflect the model's real objective
    expect(mFallback.sense).toBe("Minimize");
    expect(mFallback.objective().constant).toBe(3);

    // Mutate objective while check() fallback is awaiting
    mFallback.objective(maximize(expr`5 * ${x2} - 1`));
    gatedFallback.release();

    await expect(pendingFallback).rejects.toThrow(
      /Model "FallbackCheckModel" was modified while check\(\) was in progress; stale solver result was discarded\./
    );

    // Ensure check() fallback did NOT overwrite the newly set objective or sense
    expect(mFallback.sense).toBe("Maximize");
    expect(mFallback.objective().constant).toBe(-1);
    expect(mFallback.status).toBe("NotSolved");
    expect(x2.value).toBeNull();
  });

  it("handles overlapping solve()/check() calls so superseded earlier runs never overwrite newer runs", async () => {
    const gated1 = createGatedSolver(() => ({
      status: "Optimal",
      terminationStatus: "Optimal",
      hasPrimalSolution: true,
      objectiveValue: 100,
      values: { x: 10 },
      runTime: 20,
    }));
    const gated2 = createGatedSolver(() => ({
      status: "Optimal",
      terminationStatus: "Optimal",
      hasPrimalSolution: true,
      objectiveValue: 40,
      values: { x: 4 },
      runTime: 5,
    }));

    const m = new Model("ConcurrentModel");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.objective(maximize(expr`10 * ${x}`));

    const progressFromRun1: number[] = [];
    const progressFromRun2: number[] = [];

    const run1 = m.solve(gated1.solver, {
      onProgress: (ev) => progressFromRun1.push(ev.elapsedTime),
    });
    await gated1.waitForStart;

    // Start run2 while run1 is still in progress
    const run2 = m.solve(gated2.solver, {
      onProgress: (ev) => progressFromRun2.push(ev.elapsedTime),
    });
    await gated2.waitForStart;

    // Progress emitted by superseded run1 must be ignored, while run2 progress is forwarded
    gated1.emitProgress();
    gated2.emitProgress();
    expect(progressFromRun1).toEqual([]);
    expect(progressFromRun2).toEqual([0.01]);

    // Finish run2 first
    gated2.release();
    await expect(run2).resolves.toBe("Optimal");
    expect(m.status).toBe("Optimal");
    expect(m.objectiveValue).toBe(40);
    expect(x.value).toBe(4);

    // Now finish run1 later: it must reject as superseded and preserve run2's solution on m
    gated1.release();
    await expect(run1).rejects.toThrow(
      /Stale solve\(\) result discarded because a newer solve or check operation was started on model "ConcurrentModel"\./
    );

    expect(m.status).toBe("Optimal");
    expect(m.objectiveValue).toBe(40);
    expect(x.value).toBe(4);
    expect(m.solution?.objectiveValue).toBe(40);
  });

  it("invalidates solved state immediately when Var bounds/type or Constraint properties are mutated in-place", async () => {
    const m = new Model("InPlacePostSolve");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const c1 = x.le(8, "cap");
    m.constraint(c1);
    m.objective(maximize(x));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBeCloseTo(8, 5);
    expect(m.solution).not.toBeNull();

    // Mutate variable upper bound in-place after solve
    x.ub = 5;
    expect(m.status).toBe("NotSolved");
    expect(m.solution).toBeNull();
    expect(x.value).toBeNull();

    // Solve again and mutate constraint RHS in-place
    await m.solve();
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(5, 5);

    c1.rhs = 3;
    expect(m.status).toBe("NotSolved");
    expect(m.solution).toBeNull();
    expect(x.value).toBeNull();

    // Solve again and mutate c1.lhs.terms and c1.lhs.constant in-place
    await m.solve();
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(3, 5);

    c1.lhs.terms.set(x, 2);
    expect(m.status).toBe("NotSolved");
    expect(m.solution).toBeNull();
    expect(x.value).toBeNull();

    await m.solve();
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(1.5, 5);

    c1.lhs.constant = 1;
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();

    // Mutate objective expression in-place after solve
    c1.lhs.constant = 0;
    await m.solve();
    expect(m.status).toBe("Optimal");
    const firstObj = m.objective();
    firstObj.constant = 10;
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();

    // Direct property replacements on m.sense and m.objectiveExpr must also invalidate and attach observers
    await m.solve();
    expect(m.status).toBe("Optimal");
    m.sense = "Minimize";
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();

    await m.solve();
    expect(m.status).toBe("Optimal");
    const directObj = expr`2 * ${x}`;
    m.objectiveExpr = directObj;
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();

    // Mutating the old replaced objective expression must NOT invalidate the new solve
    await m.solve();
    expect(m.status).toBe("Optimal");
    firstObj.constant = 999;
    firstObj.terms.set(x, 999);
    expect(m.status).toBe("Optimal");

    // Mutating the newly assigned m.objectiveExpr in place MUST invalidate
    directObj.constant = 5;
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();

    // Replacing c1.lhs detaches observer from the previous lhs expression
    const oldLhs = c1.lhs;
    c1.lhs = expr`${x}`;
    await m.solve();
    expect(m.status).toBe("Optimal");
    oldLhs.constant = 123;
    expect(m.status).toBe("Optimal");
  });

  it("invalidates check() state when a Constraint or BoolOp structure is mutated in-place and rejects cross-model embedded Constraint reuse", async () => {
    const gatedNative = createGatedSolver(
      () => ({ status: "Optimal", objectiveValue: 0, values: { x: 2 }, runTime: 1 }),
      () => ({
        status: "Sat",
        terminationStatus: "Optimal",
        hasPrimalSolution: true,
        values: { x: 2, p: true, q: false },
        runTime: 1,
      })
    );

    const m = new Model({ name: "LogicalEmbeddedMutate", solver: gatedNative.solver });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const p = m.bool("p");
    const q = m.bool("q");
    const nested = x.le(5);
    const formula = p.implies(nested);
    m.constraint(formula, "imp_c");

    const checkPromise = m.check();
    await gatedNative.waitForStart;
    gatedNative.release();
    await expect(checkPromise).resolves.toMatchObject({ status: "Sat" });
    expect(m.status).toBe("Sat");
    expect(x.value).toBe(2);
    expect(p.value).toBe(true);

    // Mutating the embedded constraint's rhs clears the solved Sat state
    nested.rhs = 1;
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();
    expect(p.value).toBeNull();

    // Re-check and mutate embedded constraint's lhs terms in-place
    const checkPromise2 = m.check();
    await gatedNative.waitForStart;
    gatedNative.release();
    await expect(checkPromise2).resolves.toMatchObject({ status: "Sat" });
    expect(m.status).toBe("Sat");

    nested.lhs.terms.set(x, 3);
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();
    expect(p.value).toBeNull();

    // Re-check and mutate BoolOp.children structurally in-place
    const checkPromise3 = m.check();
    await gatedNative.waitForStart;
    gatedNative.release();
    await expect(checkPromise3).resolves.toMatchObject({ status: "Sat" });
    expect(m.status).toBe("Sat");

    const replacementConstr = x.le(8);
    formula.children.splice(1, 1, q.and(replacementConstr));
    expect(m.status).toBe("NotSolved");
    expect(x.value).toBeNull();
    expect(p.value).toBeNull();

    // Newly spliced-in Constraint child should also have ownership attached
    const checkPromise4 = m.check();
    await gatedNative.waitForStart;
    gatedNative.release();
    await expect(checkPromise4).resolves.toMatchObject({ status: "Sat" });
    expect(m.status).toBe("Sat");

    replacementConstr.rhs = 4;
    expect(m.status).toBe("NotSolved");

    // Cross-model reuse of an embedded Constraint (even variable-free) must be rejected
    const constConstraint = c`0 <= 1`;
    m.constraint(p.implies(constConstraint), "const_imp");
    const m2 = new Model("OtherLogicalModel");
    const p2 = m2.bool("p2");
    expect(() => {
      m2.constraint(p2.implies(constConstraint), "foreign_const_imp");
    }).toThrow(/already belongs to model "LogicalEmbeddedMutate"/);
  });

  it("keeps batch edits transactional so invalid batch calls neither leave partial state nor invalidate prior solutions", async () => {
    const m = new Model("TransactionalBatchModel");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.objective(maximize(x));

    await m.solve();
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(10, 5);

    const otherModel = new Model("ForeignModel");
    const foreignVar = otherModel.continuous("x", { lb: 0, ub: 5 });

    const validConstraint = c`${x} <= 9`;
    expect(() => {
      m.constraint([validConstraint, c`${foreignVar} <= 3`]);
    }).toThrow(/does not belong to model "TransactionalBatchModel"/);

    // Neither the model entities nor the solved state should have been mutated
    expect(m.constraints).toHaveLength(0);
    expect(m.getConstraintByName("c_1")).toBeUndefined();
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(10, 5);

    // Unnamed external Var and Constraint in a failed m.add([...]) batch must not leave ghost map entries
    const unnamedExtVar = new Var({ lb: 0, ub: 5 });
    const unnamedExtConstr = x.le(8);
    expect(() => {
      m.add([unnamedExtVar, unnamedExtConstr, c`${foreignVar} <= 3`]);
    }).toThrow(/does not belong to model "TransactionalBatchModel"/);
    expect(m.getVarByName("x_0")).toBeUndefined();
    expect(m.getConstraintByName("c_1")).toBeUndefined();
    expect(m.status).toBe("Optimal");

    // validConstraint ownership and auto-naming counter must have been released on rollback
    m.constraint(validConstraint);
    expect(m.constraints).toHaveLength(1);
    expect(validConstraint.name).toBe("c_1");
    expect(m.getConstraintByName("c_1")).toBe(validConstraint);
    expect(m.status).toBe("NotSolved");

    // Re-solve and verify failed variable batch creation also rolls back cleanly
    await m.solve();
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(9, 5);

    expect(() => {
      m.continuous(["new_var", "x"]);
    }).toThrow(/already exists in model/);
    expect(m.getVarByName("new_var")).toBeUndefined();
    expect(m.variables).toHaveLength(1);
    expect(m.status).toBe("Optimal");
    expect(x.value).toBeCloseTo(9, 5);

    expect(() => m.continuous(-1)).toThrow(/non-negative integer/);
    expect(() => m.integer(1.5)).toThrow(/non-negative integer/);
    expect(() => m.bool(-2)).toThrow(/non-negative integer/);
    expect(m.status).toBe("Optimal");
  });
});

