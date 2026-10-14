/**
 * HiGHS & Model Types
 */

export type VarType =
  | "Continuous"
  | "Integer"
  | "Binary"
  | "continuous"
  | "integer"
  | "binary"
  | "cont"
  | "int"
  | "bin";

export type OptimizationSense =
  | "Minimize"
  | "Maximize"
  | "minimize"
  | "maximize";

/**
 * Normalizes user-facing optimization sense to internal canonical form ("Maximize" | "Minimize")
 */
export function normalizeSense(sense?: OptimizationSense): "Maximize" | "Minimize" {
  if (!sense) return "Minimize";
  return sense.toLowerCase() === "maximize" ? "Maximize" : "Minimize";
}


export type ComparisonSense = "<=" | ">=" | "==";

export type SolverStatus =
  | "Optimal"
  | "Feasible"
  | "Infeasible"
  | "Unbounded"
  | "TimeLimit"
  | "IterationLimit"
  | "Error"
  | "NotSolved"
  | "Sat"
  | "Unsat"
  | "Unknown";

export type TerminationStatus =
  | "Optimal"
  | "Feasible"
  | "Infeasible"
  | "Unbounded"
  | "InfeasibleOrUnbounded"
  | "TimeLimit"
  | "IterationLimit"
  | "SolutionLimit"
  | "MemoryLimit"
  | "ObjectiveBound"
  | "ObjectiveTarget"
  | "Interrupted"
  | "Error"
  | "NotSolved"
  | "Sat"
  | "Unsat"
  | "Unknown";

export interface SolveProgressEvent {
  /** Elapsed solver time in seconds */
  elapsedTime: number;
  /** Alias for elapsedTime: elapsed solver time in seconds */
  elapsedSeconds?: number;
  /** Current solver phase when known */
  phase?: "simplex" | "ipm" | "mip";
  /** Best feasible incumbent objective value when available */
  objectiveValue?: number;
  /** Best proven dual / objective bound when available */
  objectiveBound?: number;
  /** Relative MIP optimality gap when available */
  relGap?: number;
  /** Alias for relGap: relative MIP optimality gap when available */
  mipGap?: number;
  /** Absolute MIP optimality gap |objectiveValue - objectiveBound| when available */
  absGap?: number;
  /** Explored MIP branch-and-bound node count when available */
  nodes?: number;
  /** Solver iteration count (simplex, IPM, or MIP LP iterations) when available */
  iterations?: number;
  /** Optional raw progress message from the solver */
  message?: string;
}

export interface SolveOptions {
  timeLimit?: number; // seconds
  outputFlag?: boolean;
  presolve?: "on" | "off" | "choose";
  solver?: any;
  relGap?: number;
  absGap?: number;
  wasmUrl?: string;
  /**
   * AbortSignal to cancel a solve:
   * - Pre-solve cancellation (`signal.aborted` before execution starts) is supported by all solvers.
   * - Preemptive mid-solve cancellation is supported in browser HiGHS via Web Worker termination
   *   (and cancels queued Worker requests before they are dispatched).
   * - Main-thread (Node.js) HiGHS supports cooperative mid-solve cancellation when `abort()` is
   *   triggered synchronously inside an `onProgress` callback at a solver interrupt checkpoint.
   * - Single-threaded WASM solvers without interrupt hooks (GLPK, Z3) check `signal` before execution starts.
   */
  signal?: AbortSignal;
  /** Callback invoked with real solver progress metrics when available */
  onProgress?: (progress: SolveProgressEvent) => void;
  [key: string]: any;
}

export interface SolverSolution {
  status: SolverStatus;
  /** Exact termination reason independent of whether a feasible incumbent is available */
  terminationStatus: TerminationStatus;
  /** Whether a feasible primal solution / incumbent is available */
  hasPrimalSolution: boolean;
  objectiveValue: number | null;
  /** Best proven dual/objective bound when provided by the solver */
  objectiveBound?: number;
  /** Relative MIP optimality gap when provided by the solver */
  relGap?: number;
  /** Alias for relGap: relative MIP optimality gap when provided by the solver */
  mipGap?: number;
  /** Absolute MIP optimality gap |objectiveValue - objectiveBound| when provided by the solver */
  absGap?: number;
  values: Record<string, number>;
  duals: Record<string, number>;
  reducedCosts: Record<string, number>;
  slacks: Record<string, number>;
  runTime: number; // in seconds
  raw?: any;
}

export interface CheckResult {
  status: "Sat" | "Unsat" | "Unknown";
  values: Record<string, number | boolean>;
  unsatCore?: readonly string[];
  /** Alias for unsatCore: subset of conflicting constraints causing infeasibility */
  conflicts?: readonly string[];
  runTime?: number;
}

