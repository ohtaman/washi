import type { Solver, SolverOptions, SolverResult } from "./types.js";
import type { LpModelData, LpExportResult } from "../lp-writer.js";
import type { SolverStatus } from "../types.js";

export interface MockSolverOptions extends SolverOptions {
  status?: SolverStatus;
  objectiveValue?: number;
  values?: Record<string, number>;
  reducedCosts?: Record<string, number>;
  duals?: Record<string, number>;
  slacks?: Record<string, number>;
  delayMs?: number;
}

/**
 * Mock / Dummy Solver for deterministic testing, CI/CD, or offline usage without WASM.
 */
export class MockSolver implements Solver {
  public readonly name = "MockSolver";
  public options: MockSolverOptions;

  constructor(options: MockSolverOptions = {}) {
    this.options = options;
  }

  async solve(
    _modelData: LpModelData,
    _lpResult: LpExportResult,
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    const opts = { ...this.options, ...options };
    if (opts.delayMs && opts.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }

    return {
      status: opts.status || "Optimal",
      objectiveValue: opts.objectiveValue ?? 0,
      values: opts.values || {},
      reducedCosts: opts.reducedCosts,
      duals: opts.duals,
      slacks: opts.slacks,
      runTime: 0.001,
      raw: { mock: true },
    };
  }
}
