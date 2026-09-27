// Core classes and helpers
export { Model, type ModelOptions } from "./model.js";
export { Var, type VarOptions } from "./variable.js";
export { LinExpr, sum, xsum, lpSum } from "./expression.js";
export { Constraint } from "./constraint.js";
export { parseExpr, parseConstraint, expr } from "./parser.js";
export { generateLpString, type LpModelData, type LpExportResult } from "./lp-writer.js";

// Type definitions
export type {
  VarType,
  OptimizationSense,
  ComparisonSense,
  SolverStatus,
  SolveOptions,
  SolverSolution,
} from "./types.js";

// PuLP-compatible API exports
export {
  LpProblem,
  LpVariable,
  LpMinimize,
  LpMaximize,
  LpContinuous,
  LpInteger,
  LpBinary,
  LpStatus,
  value,
} from "./pulp-compat.js";

// python-mip-compatible API exports
export {
  MipModel,
  MINIMIZE,
  MAXIMIZE,
  CONTINUOUS,
  INTEGER,
  BINARY,
  maximize,
  minimize,
} from "./mip-compat.js";

// Pluggable Solvers Architecture (HiGHS, GLPK, Remote, Mock, Custom)
export * from "./solvers/index.js";

// WASM loader
export { getHighs, solveLpWithHighs, setHighsWasmUrl } from "../highs-loader.js";
