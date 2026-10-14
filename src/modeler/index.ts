export { Model, type ModelOptions, type BoundsOptions, type IndicatorOptions, type ConstraintItem } from "./model.js";
export { deriveBigMForLe, deriveBigMForGe, validateUserBigM } from "./big-m.js";
export {
  maximize,
  minimize,
  type ObjectiveExpr,
  type ObjectiveSpec,
} from "./objective.js";
export { Var, type VarOptions } from "./variable.js";
export { LinExpr, type Expr, sum, dot } from "./expression.js";
export { QuadExpr, type QuadTerm } from "./quad-expr.js";
export { Constraint } from "./constraint.js";
export {
  BoolVar,
  BoolExpr,
  BoolOp,
  and,
  or,
  not,
  implies,
  xor,
} from "./boolean-expr.js";
export { parseExpr, parseConstraint, expr, c } from "./parser.js";
export { generateLpString, type LpModelData, type LpExportResult } from "./lp-writer.js";

// Type definitions
export type {
  VarType,
  OptimizationSense,
  ComparisonSense,
  SolverStatus,
  TerminationStatus,
  SolveOptions,
  SolverSolution,
  CheckResult,
} from "./types.js";

// Pluggable Solvers Architecture (HiGHS, GLPK, Remote, Mock, Custom)
export * from "./solvers/index.js";

// WASM loader
export { getHighs, solveLpWithHighs, setHighsWasmUrl, getHighsWasmUrl } from "./solvers/highs/index.js";
