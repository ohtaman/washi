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
  objectiveValue: number | null;
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

