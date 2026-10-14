import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Model,
  c,
  expr,
  maximize,
  minimize,
  MockSolver,
} from "../src/index.js";
import {
  mapHighsStatus,
  mapHighsTerminationStatus,
} from "../src/modeler/solvers/highs/solver.js";
import * as highsLoader from "../src/modeler/solvers/highs/loader.js";

describe("Solution Metrics: Incumbent Availability, Objective Bound, and MIP Gap (Issue #53)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes optimal LP and MIP solution metrics on Model and SolverSolution", async () => {
    // 1. Optimal continuous LP
    const lpModel = new Model("OptimalLP");
    const x = lpModel.continuous("x", { lb: 0, ub: 10 });
    const y = lpModel.continuous("y", { lb: 0, ub: 10 });
    lpModel.add(c`${x} + ${y} >= 5`, "c1");
    lpModel.objective(minimize(expr`2 * ${x} + 3 * ${y} + 4`));

    const lpStatus = await lpModel.solve();
    expect(lpStatus).toBe("Optimal");
    expect(lpModel.status).toBe("Optimal");
    expect(lpModel.terminationStatus).toBe("Optimal");
    expect(lpModel.hasPrimalSolution).toBe(true);
    expect(lpModel.objectiveValue).toBeCloseTo(14, 6);
    expect(lpModel.objectiveBound).toBeCloseTo(14, 6);
    expect(lpModel.absGap).toBeCloseTo(0, 6);
    expect(lpModel.relGap).toBeUndefined(); // LP does not report MIP gap
    expect(lpModel.mipGap).toBeUndefined();
    expect(lpModel.solution?.terminationStatus).toBe("Optimal");
    expect(lpModel.solution?.hasPrimalSolution).toBe(true);
    expect(lpModel.solution?.objectiveBound).toBeCloseTo(14, 6);

    // 2. Optimal MIP
    const mipModel = new Model("OptimalMIP");
    const b1 = mipModel.binary("b1");
    const b2 = mipModel.binary("b2");
    const b3 = mipModel.binary("b3");
    mipModel.add(c`2 * ${b1} + 3 * ${b2} + 4 * ${b3} <= 5`, "cap");
    mipModel.objective(maximize(expr`3 * ${b1} + 4 * ${b2} + 5 * ${b3} + 10`));

    const mipStatus = await mipModel.solve();
    expect(mipStatus).toBe("Optimal");
    expect(mipModel.terminationStatus).toBe("Optimal");
    expect(mipModel.hasPrimalSolution).toBe(true);
    expect(mipModel.objectiveValue).toBeCloseTo(17, 6);
    expect(mipModel.objectiveBound).toBeCloseTo(17, 6);
    expect(mipModel.relGap).toBeCloseTo(0, 6);
    expect(mipModel.mipGap).toBeCloseTo(0, 6);
    expect(mipModel.absGap).toBeCloseTo(0, 6);
    expect(mipModel.solution?.objectiveBound).toBeCloseTo(17, 6);
    expect(mipModel.solution?.relGap).toBeCloseTo(0, 6);
    expect(mipModel.solution?.mipGap).toBeCloseTo(0, 6);
    expect(mipModel.solution?.absGap).toBeCloseTo(0, 6);
  });

  it("distinguishes feasible-but-not-proven (SolutionLimit with incumbent) from Optimal in real HiGHS MIP solve", async () => {
    const m = new Model("SuboptimalMIPWithIncumbent");
    const x1 = m.binary("x1");
    const x2 = m.binary("x2");
    const x3 = m.binary("x3");
    const x4 = m.binary("x4");
    const x5 = m.binary("x5");
    const x6 = m.binary("x6");

    m.add(
      c`11 * ${x1} + 15 * ${x2} + 20 * ${x3} + 35 * ${x4} + 10 * ${x5} + 33 * ${x6} <= 47`,
      "knapsack"
    );
    m.objective(
      maximize(expr`10 * ${x1} + 13 * ${x2} + 18 * ${x3} + 31 * ${x4} + 7 * ${x5} + 15 * ${x6}`)
    );

    // Stop after the first improving MIP incumbent is found (before optimality is proven)
    const status = await m.solve({ presolve: "off", mip_max_improving_sols: 1 });

    expect(status).toBe("Feasible");
    expect(m.status).toBe("Feasible");
    expect(m.terminationStatus).toBe("SolutionLimit");
    expect(m.hasPrimalSolution).toBe(true);
    expect(m.objectiveValue).not.toBeNull();
    expect(m.objectiveValue!).toBeGreaterThan(0);
    expect(m.objectiveBound).toBeDefined();
    expect(m.objectiveBound!).toBeGreaterThanOrEqual(m.objectiveValue!);
    expect(m.relGap).toBeDefined();
    expect(m.relGap!).toBeGreaterThan(0);
    expect(m.mipGap).toBe(m.relGap);
    expect(m.absGap).toBeCloseTo(Math.abs(m.objectiveBound! - m.objectiveValue!), 6);
  });

  it("distinguishes time-limited-without-incumbent from time-limited-with-incumbent", async () => {
    // 1. Real HiGHS MIP with timeLimit: 0 -> TimeLimit without incumbent
    const mNoInc = new Model("TimeLimitNoIncumbent");
    const x1 = mNoInc.binary("x1");
    const x2 = mNoInc.binary("x2");
    const x3 = mNoInc.binary("x3");
    mNoInc.add(c`2 * ${x1} + 3 * ${x2} + 4 * ${x3} <= 5`, "cap");
    mNoInc.objective(maximize(expr`3 * ${x1} + 4 * ${x2} + 5 * ${x3}`));

    const statusNoInc = await mNoInc.solve({ timeLimit: 0, presolve: "off" });
    expect(statusNoInc).toBe("TimeLimit");
    expect(mNoInc.terminationStatus).toBe("TimeLimit");
    expect(mNoInc.hasPrimalSolution).toBe(false);
    expect(mNoInc.objectiveValue).toBeNull();
    expect(x1.value).toBeNull();
    expect(mNoInc.solution?.hasPrimalSolution).toBe(false);
    expect(mNoInc.solution?.values).toEqual({});

    // 2. TimeLimit WITH incumbent (simulated via HiGHS loader result)
    vi.spyOn(highsLoader, "solveLpWithHighs").mockResolvedValueOnce({
      runTime: 0.05,
      result: {
        Status: "Time limit reached",
        StatusCode: 13,
        PrimalSolutionStatus: 2,
        HasPrimalSolution: true,
        IsMip: true,
        ObjectiveValue: 7,
        MipDualBound: 9,
        MipGap: 2 / 7,
        Columns: {
          x1: { Index: 0, Lower: 0, Upper: 1, Type: "Integer", Primal: 1, Name: "x1" },
          x2: { Index: 1, Lower: 0, Upper: 1, Type: "Integer", Primal: 1, Name: "x2" },
          x3: { Index: 2, Lower: 0, Upper: 1, Type: "Integer", Primal: 0, Name: "x3" },
        },
        Rows: [{ Index: 0, Lower: -Infinity, Upper: 5, Primal: 5, Name: "cap" }],
      },
    });

    const mWithInc = new Model("TimeLimitWithIncumbent");
    const y1 = mWithInc.binary("x1");
    const y2 = mWithInc.binary("x2");
    const y3 = mWithInc.binary("x3");
    mWithInc.add(c`2 * ${y1} + 3 * ${y2} + 4 * ${y3} <= 5`, "cap");
    mWithInc.objective(maximize(expr`3 * ${y1} + 4 * ${y2} + 5 * ${y3}`));

    const statusWithInc = await mWithInc.solve({ timeLimit: 1 });
    expect(statusWithInc).toBe("TimeLimit");
    expect(mWithInc.terminationStatus).toBe("TimeLimit");
    expect(mWithInc.hasPrimalSolution).toBe(true);
    expect(mWithInc.objectiveValue).toBe(7);
    expect(mWithInc.objectiveBound).toBe(9);
    expect(mWithInc.relGap).toBeCloseTo(2 / 7, 6);
    expect(mWithInc.mipGap).toBeCloseTo(2 / 7, 6);
    expect(mWithInc.absGap).toBeCloseTo(2, 6);
    expect(y1.value).toBe(1);
    expect(y2.value).toBe(1);
    expect(y3.value).toBe(0);
  });

  it("resets solution metrics cleanly when model is mutated or re-solved", async () => {
    const m = new Model("ResetMetricsTest");
    const x = m.binary("x");
    m.objective(maximize(x));
    await m.solve();

    expect(m.status).toBe("Optimal");
    expect(m.terminationStatus).toBe("Optimal");
    expect(m.hasPrimalSolution).toBe(true);
    expect(m.objectiveBound).toBe(1);
    expect(m.relGap).toBe(0);
    expect(m.absGap).toBe(0);

    // Mutating model resets all metrics
    m.add(c`${x} <= 0`);
    expect(m.status).toBe("NotSolved");
    expect(m.terminationStatus).toBe("NotSolved");
    expect(m.hasPrimalSolution).toBe(false);
    expect(m.objectiveValue).toBeNull();
    expect(m.objectiveBound).toBeUndefined();
    expect(m.relGap).toBeUndefined();
    expect(m.mipGap).toBeUndefined();
    expect(m.absGap).toBeUndefined();
  });

  it("exposes documented metrics for GLPK and Z3 without inventing unavailable bound/gap defaults", async () => {
    await import("../src/modeler/solvers/glpk/index.js");
    await import("../src/modeler/solvers/z3/index.js");

    // 1. GLPK optimal MIP
    const mGlpk = new Model({ name: "GlpkMetrics", solver: "glpk" });
    const g1 = mGlpk.binary("g1");
    const g2 = mGlpk.binary("g2");
    mGlpk.add(c`${g1} + ${g2} <= 1`);
    mGlpk.objective(maximize(expr`4 * ${g1} + 6 * ${g2}`));

    const glpkStatus = await mGlpk.solve();
    expect(glpkStatus).toBe("Optimal");
    expect(mGlpk.terminationStatus).toBe("Optimal");
    expect(mGlpk.hasPrimalSolution).toBe(true);
    expect(mGlpk.objectiveValue).toBe(6);
    expect(mGlpk.objectiveBound).toBeUndefined();
    expect(mGlpk.relGap).toBeUndefined();
    expect(mGlpk.mipGap).toBeUndefined();
    expect(mGlpk.absGap).toBeUndefined();

    // 2. Z3 optimal MIP
    const mZ3 = new Model({ name: "Z3Metrics", solver: "z3" });
    const z1 = mZ3.binary("z1");
    const z2 = mZ3.binary("z2");
    mZ3.add(c`${z1} + ${z2} <= 1`);
    mZ3.objective(maximize(expr`4 * ${z1} + 6 * ${z2}`));

    const z3Status = await mZ3.solve();
    expect(z3Status).toBe("Optimal");
    expect(mZ3.terminationStatus).toBe("Optimal");
    expect(mZ3.hasPrimalSolution).toBe(true);
    expect(mZ3.objectiveValue).toBe(6);
    expect(mZ3.objectiveBound).toBeUndefined();
    expect(mZ3.relGap).toBeUndefined();
    expect(mZ3.mipGap).toBeUndefined();
    expect(mZ3.absGap).toBeUndefined();

    // 3. MockSolver custom metrics
    const mMock = new Model("MockMetrics");
    const mx = mMock.continuous("mx", { lb: 0, ub: 10 });
    mMock.objective(minimize(mx));
    await mMock.solve(
      new MockSolver({
        status: "TimeLimit",
        terminationStatus: "TimeLimit",
        hasPrimalSolution: true,
        objectiveValue: 5,
        objectiveBound: 2,
        relGap: 0.6,
        values: { mx: 5 },
      })
    );
    expect(mMock.status).toBe("TimeLimit");
    expect(mMock.terminationStatus).toBe("TimeLimit");
    expect(mMock.hasPrimalSolution).toBe(true);
    expect(mMock.objectiveValue).toBe(5);
    expect(mMock.objectiveBound).toBe(2);
    expect(mMock.relGap).toBe(0.6);
    expect(mMock.mipGap).toBe(0.6);
    expect(mMock.absGap).toBe(3);
  });

  it("maps all HiGHS status codes and strings accurately in mapHighsTerminationStatus and mapHighsStatus", () => {
    expect(mapHighsTerminationStatus("Optimal", 7)).toBe("Optimal");
    expect(mapHighsTerminationStatus("Primal infeasible or unbounded", 9)).toBe("InfeasibleOrUnbounded");
    expect(mapHighsTerminationStatus("Solution limit reached", 16)).toBe("SolutionLimit");
    expect(mapHighsTerminationStatus("Interrupted", 17)).toBe("Interrupted");
    expect(mapHighsTerminationStatus("Bound on objective reached", 11)).toBe("ObjectiveBound");
    expect(mapHighsTerminationStatus("Target for objective reached", 12)).toBe("ObjectiveTarget");

    expect(mapHighsStatus("Primal infeasible or unbounded", 9)).toBe("Unknown");
    expect(mapHighsStatus("Solution limit reached", 16, true)).toBe("Feasible");
    expect(mapHighsStatus("Solution limit reached", 16, false)).toBe("Unknown");
    expect(mapHighsStatus("Interrupted", 17, true)).toBe("Feasible");
    expect(mapHighsStatus("Interrupted", 17, false)).toBe("Unknown");
  });

  it("recomputes relative MIP gap using shifted objective and detects unbounded Z3 objectives", async () => {
    vi.spyOn(highsLoader, "solveLpWithHighs").mockResolvedValueOnce({
      runTime: 0.01,
      result: {
        Status: "Time limit reached",
        StatusCode: 13,
        PrimalSolutionStatus: 2,
        HasPrimalSolution: true,
        IsMip: true,
        ObjectiveValue: 10,
        MipDualBound: 15,
        MipGap: 0.5,
        Columns: {
          x: { Index: 0, Type: "Integer", Primal: 10, Name: "x" },
        },
        Rows: [],
      },
    });

    const m = new Model("ShiftedObjectiveGap");
    const x = m.integer("x", { lb: 0, ub: 20 });
    m.objective(maximize(expr`${x} + 90`));

    await m.solve({ timeLimit: 1 });
    expect(m.objectiveValue).toBe(100);
    expect(m.objectiveBound).toBe(105);
    expect(m.absGap).toBeCloseTo(5, 8);
    expect(m.relGap).toBeCloseTo(5 / 100, 8);
    expect(m.mipGap).toBeCloseTo(0.05, 8);

    const unsatMock = new MockSolver({ status: "Unsat" });
    const unsatRes = await unsatMock.solve({} as any, {} as any);
    expect(unsatRes.hasPrimalSolution).toBe(false);
    expect(unsatRes.objectiveValue).toBeNull();

    const unknownMock = new MockSolver({ status: "Unknown" });
    const unknownRes = await unknownMock.solve({} as any, {} as any);
    expect(unknownRes.hasPrimalSolution).toBe(false);
    expect(unknownRes.objectiveValue).toBeNull();

    // Unbounded Z3 optimization objective
    await import("../src/modeler/solvers/z3/index.js");
    const mZ3Unb = new Model({ name: "Z3Unbounded", solver: "z3" });
    const zu = mZ3Unb.continuous("zu", { lb: 0, ub: Infinity });
    mZ3Unb.objective(maximize(zu));
    const z3UnbStatus = await mZ3Unb.solve();
    expect(z3UnbStatus).toBe("Unbounded");
    expect(mZ3Unb.terminationStatus).toBe("Unbounded");
    expect(mZ3Unb.hasPrimalSolution).toBe(true);
    expect(zu.value).not.toBeNull();

    // Real HiGHS MIP with nonzero objective offset and mipGap tolerance preserves nonzero relGap at Optimal
    const mOffsetGap = new Model("OffsetGapTolerance");
    const ox1 = mOffsetGap.integer("ox1", { lb: 0 });
    const ox2 = mOffsetGap.integer("ox2", { lb: 0 });
    const ox3 = mOffsetGap.integer("ox3", { lb: 0 });
    mOffsetGap.add(c`2 * ${ox1} + 2 * ${ox2} >= 1`);
    mOffsetGap.add(c`2 * ${ox2} + 2 * ${ox3} >= 1`);
    mOffsetGap.add(c`2 * ${ox1} + 2 * ${ox3} >= 1`);
    mOffsetGap.objective(minimize(expr`10 * ${ox1} + 10 * ${ox2} + 10 * ${ox3} + 980`));
    const offsetGapStatus = await mOffsetGap.solve({ presolve: "off", mipGap: 0.02 });
    expect(offsetGapStatus).toBe("Optimal");
    expect(mOffsetGap.objectiveValue).toBe(1000);
    expect(mOffsetGap.objectiveBound).toBe(990);
    expect(mOffsetGap.absGap).toBe(10);
    expect(mOffsetGap.relGap).toBeCloseTo(0.01, 6);

    // Fallback m.check() with HiGHS clears temporary zero-objective optimization metrics
    const mCheckFallback = new Model("CheckFallback");
    const cx = mCheckFallback.integer("cx", { lb: 1, ub: 5 });
    mCheckFallback.objective(maximize(expr`10 * ${cx} + 50`));
    const checkRes = await mCheckFallback.check({ solver: "highs" });
    expect(checkRes.status).toBe("Sat");
    expect(mCheckFallback.status).toBe("Sat");
    expect(mCheckFallback.terminationStatus).toBe("Sat");
    expect(mCheckFallback.hasPrimalSolution).toBe(true);
    expect(mCheckFallback.objectiveValue).toBeNull();
    expect(mCheckFallback.objectiveBound).toBeUndefined();
    expect(mCheckFallback.relGap).toBeUndefined();
    expect(mCheckFallback.mipGap).toBeUndefined();
    expect(mCheckFallback.absGap).toBeUndefined();
    expect(mCheckFallback.solution).toBeNull();
  });
});

