import type { Solver, SolverOptions, SolverResult, SolverCapabilities } from "./types.js";
import type { LpModelData, LpExportResult } from "../lp-writer.js";
import type { SolverStatus, TerminationStatus } from "../types.js";

export interface MockSolverOptions extends SolverOptions {
  name?: string;
  capabilities?: SolverCapabilities;
  status?: SolverStatus;
  terminationStatus?: TerminationStatus;
  hasPrimalSolution?: boolean;
  objectiveValue?: number | null;
  objectiveBound?: number;
  relGap?: number;
  mipGap?: number;
  absGap?: number;
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
  public readonly name: string;
  public readonly capabilities: SolverCapabilities;
  public options: MockSolverOptions;

  constructor(options: MockSolverOptions = {}) {
    this.name = options.name || "MockSolver";
    this.capabilities = options.capabilities || { supportsMIP: true, supportsQP: true };
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

    const status = opts.status || "Optimal";
    const terminationStatus = opts.terminationStatus ?? status;
    const hasPrimalSolution =
      opts.hasPrimalSolution !== undefined
        ? opts.hasPrimalSolution
        : status === "Optimal" ||
          status === "Feasible" ||
          status === "Sat" ||
          ((status === "TimeLimit" || status === "IterationLimit") &&
            Boolean(opts.values && Object.keys(opts.values).length > 0));

    return {
      status,
      terminationStatus,
      hasPrimalSolution,
      objectiveValue: hasPrimalSolution ? (opts.objectiveValue ?? 0) : null,
      ...(opts.objectiveBound !== undefined ? { objectiveBound: opts.objectiveBound } : {}),
      ...(opts.relGap !== undefined
        ? { relGap: opts.relGap, mipGap: opts.relGap }
        : opts.mipGap !== undefined
          ? { relGap: opts.mipGap, mipGap: opts.mipGap }
          : {}),
      ...(opts.absGap !== undefined ? { absGap: opts.absGap } : {}),
      values: hasPrimalSolution ? opts.values || {} : {},
      reducedCosts: opts.reducedCosts,
      duals: opts.duals,
      slacks: opts.slacks,
      runTime: 0.001,
      raw: { mock: true },
    };
  }
}

import { registerSolver } from "./registry.js";
export function registerMockSolver(): void {
  registerSolver("mock", (opts) => new MockSolver(opts));
}
registerMockSolver();

