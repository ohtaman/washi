import { describe, it, expect, beforeAll } from "vitest";
import {
  Model,
  sum,
  and,
  or,
  not,
  implies,
} from "../src/index.js";
import { Z3Solver, registerZ3Solver } from "../src/modeler/solvers/z3.js";

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
    const isAdult = m.addBoolVar("isAdult");
    const hasLicense = m.addBoolVar("hasLicense");
    const canDrive = m.addBoolVar("canDrive");

    // canDrive => (isAdult AND hasLicense)
    m.addConstraint(canDrive.implies(isAdult.and(hasLicense)), "license_rule");
    // canDrive is true
    m.addConstraint(canDrive, "must_drive");

    const result = await m.check({ solver: "z3" });

    expect(result.status).toBe("Sat");
    expect(m.values.get("canDrive")).toBe(true);
    expect(m.values.get("isAdult")).toBe(true);
    expect(m.values.get("hasLicense")).toBe(true);
  });

  it("solves mixed arithmetic and logical constraints (SMT)", async () => {
    const m = new Model("MixedSMT");
    const x = m.addVar({ name: "x", type: "INTEGER", lb: 0 });
    const y = m.addVar({ name: "y", type: "INTEGER", lb: 0 });
    const isHoliday = m.addBoolVar("isHoliday");

    // (x + y >= 10) OR isHoliday
    m.addConstraint(sum([x, y]).ge(10).or(isHoliday), "c1");
    // isHoliday => (x <= 2)
    m.addConstraint(isHoliday.implies(x.le(2)), "c2");
    // Not(isHoliday)
    m.addConstraint(not(isHoliday), "c3");

    const result = await m.check({ solver: "z3" });

    expect(result.status).toBe("Sat");
    expect(m.values.get("isHoliday")).toBe(false);
    const xVal = m.values.get("x") as number;
    const yVal = m.values.get("y") as number;
    expect(xVal + yVal).toBeGreaterThanOrEqual(10);
  });

  it("identifies conflicting constraints with unsatCore", async () => {
    const m = new Model("ConflictingConstraints");
    const x = m.addVar({ name: "x", type: "CONTINUOUS", lb: 0 });
    const y = m.addVar({ name: "y", type: "CONTINUOUS", lb: 0 });

    // Conflicting constraints
    m.addConstraint(x.ge(10), "x_must_be_large");
    m.addConstraint(x.le(5), "x_must_be_small");
    // Harmless constraint
    m.addConstraint(y.ge(0), "y_positive");

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
    const x = m.addVar({ name: "x", type: "INTEGER", lb: 0, ub: 8 });
    const y = m.addVar({ name: "y", type: "INTEGER", lb: 0, ub: 6 });

    // x + y <= 10
    m.addConstraint(sum([x, y]).le(10), "resource");
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
    const x = m.addVar({ name: "x", type: "INTEGER", lb: 0, ub: 10 });
    const y = m.addVar({ name: "y", type: "INTEGER", lb: 0, ub: 10 });

    m.addConstraint(sum([x, y]).ge(5), "min_total");
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

  it("correctly reports Unsat when an Integer variable is constrained to a non-integer value (x == 0.5)", async () => {
    const m = new Model("IntegerHalf");
    const x = m.addVar({
      name: "integer_x",
      type: "Integer",
      lb: 0,
      ub: 1,
    });
    m.addConstraint(x.eq(0.5), "half_integer");

    const result = await m.check({ solver: "z3" });
    expect(result.status).toBe("Unsat");
    expect(result.values).toEqual({});
    expect(result.unsatCore).toContain("half_integer");
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
      const x = m.addVar({ name: "integer_x", type: "Integer", lb: 0, ub: 1 });
      m.addConstraint(x.eq(0.5), "half_integer");

      await expect(m.check({ solver: "z3" })).rejects.toThrow(/Failed to load z3-solver/);
    } finally {
      vi.doUnmock("z3-solver");
      resetZ3LoaderCache();
    }
  });
});

