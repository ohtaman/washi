import { describe, it, expect, vi, afterEach } from "vitest";
import { HighsSolver, mapHighsStatus } from "../src/modeler/solvers/highs.js";
import * as workerClient from "../src/modeler/solvers/highs/worker-client.js";

describe("HiGHS status mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps Optimal to Optimal", () => {
    expect(mapHighsStatus("Optimal")).toBe("Optimal");
  });

  it("maps actual HiGHS status strings for infeasible, unbounded, limits, and feasible", () => {
    expect(mapHighsStatus("Infeasible")).toBe("Infeasible");
    expect(mapHighsStatus("Unbounded")).toBe("Unbounded");
    expect(mapHighsStatus("Primal infeasible or unbounded")).toBe("Unknown");
    expect(mapHighsStatus("Time limit reached")).toBe("TimeLimit");
    expect(mapHighsStatus("TimeLimit")).toBe("TimeLimit");
    expect(mapHighsStatus("Iteration limit reached")).toBe("IterationLimit");
    expect(mapHighsStatus("IterationLimit")).toBe("IterationLimit");
    expect(mapHighsStatus("Bound on objective reached")).toBe("Feasible");
    expect(mapHighsStatus("Target for objective reached")).toBe("Feasible");
    expect(mapHighsStatus("Not Set")).toBe("NotSolved");
  });

  it("maps HiGHS error statuses to Error", () => {
    for (const errStatus of [
      "Load error",
      "Model error",
      "Presolve error",
      "Solve error",
      "Postsolve error",
      "Error",
    ]) {
      expect(mapHighsStatus(errStatus)).toBe("Error");
    }
  });

  it("never maps Unknown, Empty, unrecognized strings, empty string, or missing status to Optimal", () => {
    for (const raw of ["Unknown", "Empty", "SomeUnexpectedStatus", "", "   ", undefined, null, 123]) {
      const mapped = mapHighsStatus(raw);
      expect(mapped).not.toBe("Optimal");
      expect(mapped).toBe("Unknown");
    }
  });

  it("returns Unknown and preserves raw result when HiGHS returns an unknown or missing status", async () => {
    vi.spyOn(workerClient, "solveLp").mockResolvedValueOnce({
      result: { Status: undefined as unknown as string, Columns: {}, Rows: [] },
      runTime: 0.01,
    });

    const solver = new HighsSolver();
    const res = await solver.solve(
      {
        name: "Test",
        sense: "Minimize",
        objective: { terms: new Map(), constant: 0 } as any,
        variables: [],
        constraints: [],
      },
      {
        lpString: "Minimize\n obj: 0\nEnd",
        varToName: new Map(),
        nameToVar: new Map(),
        constraintToName: new Map(),
        nameToConstraint: new Map(),
      }
    );

    expect(res.status).toBe("Unknown");
    expect(res.status).not.toBe("Optimal");
    expect(res.raw).toEqual({ Status: undefined, Columns: {}, Rows: [] });
  });
});
