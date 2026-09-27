import type { SolverStatus } from "../types.js";
import type { LpModelData, LpExportResult } from "../lp-writer.js";

/**
 * Normalized solution result returned by any solver adapter
 */
export interface SolverResult {
  status: SolverStatus;
  objectiveValue: number | null;
  /** Variable primal values (keyed by variable name or ID) */
  values: Record<string, number>;
  /** Variable reduced costs (optional) */
  reducedCosts?: Record<string, number>;
  /** Constraint dual values (optional) */
  duals?: Record<string, number>;
  /** Constraint slacks (optional) */
  slacks?: Record<string, number>;
  /** Solution time in seconds */
  runTime?: number;
  /** Raw solver output or diagnostic logs */
  logs?: string[];
  raw?: any;
}

/**
 * Common solver options supported across solvers
 */
export interface SolverOptions {
  /** Maximum solve time limit in seconds */
  timeLimit?: number;
  /** Presolve mode */
  presolve?: "on" | "off" | "choose";
  /** Relative MIP gap tolerance (e.g. 0.01 for 1%) */
  mipGap?: number;
  /** Number of parallel threads */
  threads?: number;
  /** Enable verbose solver logging */
  verbose?: boolean;
  /** Use Web Worker for non-blocking browser execution */
  useWorker?: boolean;
  /** Additional solver-specific options */
  [key: string]: any;
}

/**
 * Universal Solver interface.
 * Any optimization engine (HiGHS WASM, GLPK, Gurobi Remote, CBC, SCIP, custom JS)
 * implements this interface to be used interchangeably with Model and LpProblem.
 */
export interface Solver {
  /** Identifier name of the solver engine */
  readonly name: string;
  /** Version string of the solver */
  readonly version?: string;
  /**
   * Solve the given mathematical programming model data
   */
  solve(
    modelData: LpModelData,
    lpResult: LpExportResult,
    options?: SolverOptions
  ): Promise<SolverResult>;
}
