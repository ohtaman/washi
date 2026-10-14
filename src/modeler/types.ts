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

export interface SolveOptions {
  timeLimit?: number; // seconds
  outputFlag?: boolean;
  presolve?: "on" | "off" | "choose";
  solver?: any;
  relGap?: number;
  absGap?: number;
  wasmUrl?: string;
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

