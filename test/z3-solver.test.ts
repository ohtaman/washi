import { describe, it, expect, beforeAll } from "vitest";
import {
  Model,
  sum,
  and,
  or,
  not,
  implies,
} from "../src/index.js";
import { Z3Solver, registerZ3Solver, killZ3Threads } from "../src/modeler/solvers/z3.js";

describe("Z3Solver (SMT & SAT & MIP)", () => {
  beforeAll(async () => {
    registerZ3Solver();
  });

  it("has correct capabilities for SMT, SAT, and MIP", () => {
    const solver = new Z3Solver();
    expect(solver.name).toBe("z3");
    expect(solver.capabilities.supportsSMT).toBe(true);
    expect(solver.capabilities.supportsUnsatCore).toBe(true);
    expect(solver.capabilities.supportsMIP).toBe(true);
  });

  it("solves pure SAT / propositional logic problems via check()", async () => {
    const m = new Model("LogicPuzzle");
    const isAdult = m.bool("isAdult");
    const hasLicense = m.bool("hasLicense");
    const canDrive = m.bool("canDrive");

    // canDrive => (isAdult AND hasLicense)
    m.constrain(canDrive.implies(isAdult.and(hasLicense)), "license_rule");
    // canDrive is true
    m.constrain(canDrive, "must_drive");

    const result = await m.check({ solver: "z3" });

    expect(result.status).toBe("Sat");
    expect(m.values.get("canDrive")).toBe(true);
    expect(m.values.get("isAdult")).toBe(true);
    expect(m.values.get("hasLicense")).toBe(true);
  });

  it("solves mixed arithmetic and logical constraints (SMT)", async () => {
    const m = new Model("MixedSMT");
    const x = m.integer("x", { lb: 0 });
    const y = m.integer("y", { lb: 0 });
    const isHoliday = m.bool("isHoliday");

    // (x + y >= 10) OR isHoliday
    m.constrain(sum([x, y]).ge(10).or(isHoliday), "c1");
    // isHoliday => (x <= 2)
    m.constrain(isHoliday.implies(x.le(2)), "c2");
    // Not(isHoliday)
    m.constrain(not(isHoliday), "c3");

    const result = await m.check({ solver: "z3" });

    expect(result.status).toBe("Sat");
    expect(m.values.get("isHoliday")).toBe(false);
    const xVal = m.values.get("x") as number;
    const yVal = m.values.get("y") as number;
    expect(xVal + yVal).toBeGreaterThanOrEqual(10);
  });

  it("identifies conflicting constraints with unsatCore", async () => {
    const m = new Model("ConflictingConstraints");
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    // Conflicting constraints
    m.constrain(x.ge(10), "x_must_be_large");
    m.constrain(x.le(5), "x_must_be_small");
    // Harmless constraint
    m.constrain(y.ge(0), "y_positive");

    const result = await m.check({ solver: "z3" });

    expect(result.status).toBe("Unsat");
    expect(result.unsatCore).toBeDefined();
    expect(result.unsatCore).toContain("x_must_be_large");
    expect(result.unsatCore).toContain("x_must_be_small");
    expect(result.unsatCore).not.toContain("y_positive");
    expect(m.unsatCore).toEqual(result.unsatCore);
  });

  it("solves MIP optimization problems with objective function", async () => {
    const m = new Model("MIP_Production");
    const x = m.integer("x", { lb: 0, ub: 8 });
    const y = m.integer("y", { lb: 0, ub: 6 });

    // x + y <= 10
    m.constrain(sum([x, y]).le(10), "resource");
    // Maximize 3x + 5y -> at x=4, y=6 => 12 + 30 = 42
    m.maximize(sum([x.mul(3), y.mul(5)]));

    const status = await m.optimize({ solver: "z3" });

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(42);
    expect(m.values.get("x")).toBe(4);
    expect(m.values.get("y")).toBe(6);
  });

  it("enables hybrid pipeline: Z3 check() validation before HiGHS optimize()", async () => {
    const m = new Model("HybridPipeline");
    const x = m.integer("x", { lb: 0, ub: 10 });
    const y = m.integer("y", { lb: 0, ub: 10 });

    m.constrain(sum([x, y]).ge(5), "min_total");
    m.maximize(sum([x.mul(10), y.mul(20)]));

    // Phase 1: Check feasibility & validate constraints using Z3
    const checkRes = await m.check({ solver: "z3" });
    expect(checkRes.status).toBe("Sat");

    // Phase 2: Solve large MIP optimization using HiGHS
    const optStatus = await m.optimize({ solver: "highs" });
    expect(optStatus).toBe("Optimal");
    expect(m.objectiveValue).toBe(300); // x=10, y=10 => 100 + 200 = 300
    expect(m.values.get("x")).toBe(10);
    expect(m.values.get("y")).toBe(10);
  });

  it("halts hybrid pipeline when policy check() is Unsat (verifying status === 'Sat')", async () => {
    const policy = new Model({ solver: "z3" });
    const budgetTierHigh = policy.bool("budgetTierHigh");
    policy.constrain(budgetTierHigh, "budget_must_be_high");
    policy.constrain(budgetTierHigh.not(), "budget_must_be_low");

    const policyCheck = await policy.check();
    // SolverCheckResult is an object and truthy, so checking Boolean(policyCheck) would be a bug (Issue #28)
    expect(Boolean(policyCheck)).toBe(true);
    expect(policyCheck.status).toBe("Unsat");

    let mipExecuted = false;
    // Only proceed to HiGHS when explicitly Sat
    if (policyCheck.status === "Sat") {
      const mip = new Model("ShouldNotRun");
      const x = mip.continuous("x", { lb: 0 });
      mip.constrain(x.ge(10));
      await mip.optimize({ solver: "highs" });
      mipExecuted = true;
    }

    expect(mipExecuted).toBe(false);
  });

  it("correctly reports Unsat when an Integer variable is constrained to a non-integer value (x == 0.5)", async () => {
    const m = new Model("IntegerHalf");
    const x = m.integer("integer_x", {
      lb: 0,
      ub: 1,
    });
    m.constrain(x.eq(0.5), "half_integer");

    const result = await m.check({ solver: "z3" });
    expect(result.status).toBe("Unsat");
    expect(result.values).toEqual({});
    expect(result.unsatCore).toContain("half_integer");
  });

  it("handles mixed Integer and Continuous arithmetic regardless of term order and non-integer coefficients", async () => {
    // 1. Integer x + Continuous y <= 1 (Int first, then Real)
    const m1 = new Model("MixedIntFirst");
    const x1 = m1.integer("x", { lb: 0, ub: 1 });
    const y1 = m1.continuous("y", { lb: 0, ub: 1 });
    m1.constrain(x1.add(y1).le(1), "int_plus_real");
    const res1 = await m1.check({ solver: "z3" });
    expect(res1.status).toBe("Sat");

    // 2. Continuous y + Integer x <= 1 (Real first, then Int)
    const m2 = new Model("MixedRealFirst");
    const x2 = m2.integer("x", { lb: 0, ub: 1 });
    const y2 = m2.continuous("y", { lb: 0, ub: 1 });
    m2.constrain(y2.add(x2).le(1), "real_plus_int");
    const res2 = await m2.check({ solver: "z3" });
    expect(res2.status).toBe("Sat");

    // 3. Non-integer coefficient on Integer variable: 0.5 * x == 0.5 -> x = 1 (Sat)
    const m3 = new Model("FractionalCoeffOnInt");
    const x3 = m3.integer("x", { lb: 0, ub: 1 });
    m3.constrain(x3.mul(0.5).eq(0.5), "half_coeff");
    const res3 = await m3.check({ solver: "z3" });
    expect(res3.status).toBe("Sat");
    expect(res3.values.x).toBe(1);
  });

  it("throws an explicit error instead of falling back when Z3 fails to load or in a mocked browser without Z3", async () => {
    const { vi } = await import("vitest");
    const { resetZ3LoaderCache } = await import("../src/modeler/solvers/z3.js");

    vi.doMock("z3-solver", () => ({
      init: vi.fn().mockRejectedValue(new Error("z3-solver unavailable")),
    }));
    resetZ3LoaderCache();

    try {
      const m = new Model("MissingZ3");
      const x = m.integer("integer_x", { lb: 0, ub: 1 });
      m.constrain(x.eq(0.5), "half_integer");

      await expect(m.check({ solver: "z3" })).rejects.toThrow(/Failed to load z3-solver/);
    } finally {
      vi.doUnmock("z3-solver");
      resetZ3LoaderCache();
    }
  });

  it("releases internal locks and recovers on subsequent check() after worker error", async () => {
    const { loadZ3, notifyZ3WorkerError, killZ3Threads } = await import("../src/modeler/solvers/z3.js");
    await loadZ3();

    const m1 = new Model("ErrorModel");
    const a1 = m1.bool("a1");
    m1.constrain(a1);

    const checkPromise1 = m1.check({ solver: "z3" });
    // Let solver begin execution before worker error occurs
    await new Promise((r) => setTimeout(r, 1));
    notifyZ3WorkerError(new Error("Simulated worker error during check"));

    await expect(checkPromise1).rejects.toThrow(/Simulated worker error/);

    // Verify recovery: subsequent check() must not deadlock on asyncMutex and must solve correctly
    const m2 = new Model("RecoveryModel");
    const a2 = m2.bool("a2");
    m2.constrain(a2);

    const res2 = await m2.check({ solver: "z3" });
    expect(res2.status).toBe("Sat");
    expect(res2.values.a2).toBe(true);

    await killZ3Threads();
  });

  it("cleans up tracking and avoids unhandledRejection on synchronous failure and killZ3Threads", async () => {
    const { loadZ3, killZ3Threads } = await import("../src/modeler/solvers/z3.js");
    const instance = await loadZ3();

    const unhandled: any[] = [];
    const listener = (reason: any) => unhandled.push(reason);
    process.on("unhandledRejection", listener);

    try {
      // Force em.async_call to throw synchronously
      instance.em.async_call = () => {
        throw new Error("Synchronous worker init exception");
      };

      const m = new Model("SyncFailModel");
      const a = m.bool("a");
      m.constrain(a);

      await expect(m.check({ solver: "z3" })).rejects.toThrow(/Synchronous worker init exception/);

      // Subsequent killZ3Threads should complete cleanly without unhandledRejection
      await killZ3Threads();
      expect(unhandled).toHaveLength(0);

      // Verify recovery: a fresh model solves after sync failure
      const mRecover = new Model("SyncRecoverModel");
      const b = mRecover.bool("b");
      mRecover.constrain(b);
      const res = await mRecover.check({ solver: "z3" });
      expect(res.status).toBe("Sat");
      expect(res.values.b).toBe(true);

      await killZ3Threads();
    } finally {
      process.off("unhandledRejection", listener);
    }
  });

  it("clears BoolVar and Var values when re-running check() transitioning from Sat to Unsat", async () => {
    const m = new Model({ solver: "z3" });
    const b = m.bool("b");
    const x = m.integer("x", { lb: 0, ub: 10 });
    m.constrain(b);
    m.constrain(x.ge(5));

    const res1 = await m.check();
    expect(res1.status).toBe("Sat");
    expect(b.value).toBe(true);
    expect(x.value).toBe(5);
    expect(m.values.get("b")).toBe(true);
    expect(m.values.get("x")).toBe(5);

    // Add contradicting constraint to make model Unsat
    m.constrain(b.not());
    const res2 = await m.check();
    expect(res2.status).toBe("Unsat");
    expect(b.value).toBe(null);
    expect(x.value).toBe(null);
    expect(m.values.size).toBe(0);

    await killZ3Threads();
  });

  it("clears BoolVar and Var values when re-running solve() transitioning from Optimal to Infeasible", async () => {
    const m = new Model({ solver: "z3" });
    const b = m.bool("b");
    const x = m.integer("x", { lb: 0, ub: 10 });
    m.constrain(b);
    m.constrain(x.ge(5));
    m.maximize(x);

    const status1 = await m.solve();
    expect(status1).toBe("Optimal");
    expect(b.value).toBe(true);
    expect(x.value).toBe(10);
    expect(m.values.get("b")).toBe(1);
    expect(m.values.get("x")).toBe(10);

    // Add contradicting constraint to make model Infeasible
    m.constrain(b.not());
    const status2 = await m.solve();
    expect(status2).toBe("Infeasible");
    expect(b.value).toBe(null);
    expect(x.value).toBe(null);
    expect(m.values.size).toBe(0);

    await killZ3Threads();
  });
});


