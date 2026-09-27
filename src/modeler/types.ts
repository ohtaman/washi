/**
 * HiGHS & Model Types
 */

export type VarType = "Continuous" | "Integer" | "Binary";

export type OptimizationSense = "Minimize" | "Maximize";

export type ComparisonSense = "<=" | ">=" | "==";

export type SolverStatus =
  | "Optimal"
  | "Feasible"
  | "Infeasible"
  | "Unbounded"
  | "TimeLimit"
  | "IterationLimit"
  | "Error"
  | "NotSolved";

export interface SolveOptions {
  timeLimit?: number; // seconds
  outputFlag?: boolean;
  presolve?: "on" | "off" | "choose";
  solver?: "choose" | "simplex" | "ipm" | "pdlp";
  relGap?: number;
  absGap?: number;
  wasmUrl?: string;
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
