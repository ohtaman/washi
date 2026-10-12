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
  solver?: "choose" | "simplex" | "ipm" | "pdlp" | (string & {});
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
