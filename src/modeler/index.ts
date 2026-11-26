export {
  Model,
  type ModelOptions,
  type BoundsOptions,
  type BinaryOptions,
  type IndicatorOptions,
  type ConstraintItem,
  type KeyCollection,
  type LogicalConstraint,
} from "./model.js";
export { deriveBigMForLe, deriveBigMForGe, validateUserBigM, buildIndicatorLinearization } from "./big-m.js";
export { linearizeModelForMip, type LinearizationResult } from "./linearizer.js";
export {
  maximize,
  minimize,
  type ObjectiveExpr,
  type ObjectiveSpec,
} from "./objective.js";
export { Var, type VarOptions } from "./variable.js";
export {
  LinExpr,
  type Expr,
  type NonlinearAtom,
  type NonlinearTerm,
  type DotTerm,
  type DotVarContainer,
  type DotCoeffContainer,
  type SumTerm,
  type SumContainer,
  type ExtremumTerm,
  type ExtremumArg,
  sum,
  dot,
  abs,
  max,
  min,
  at,
} from "./expression.js";
export { QuadExpr, type QuadTerm } from "./quad-expr.js";
export { Constraint } from "./constraint.js";
export {
  BoolVar,
  BoolExpr,
  BoolOp,
  GlobalConstraint,
  type GlobalConstraintSpec,
  type DiscreteExprOperand,
  type DisjointTask,
  type CumulativeTask,
  type LogicElement,
  type LogicInput,
  and,
  or,
  not,
  implies,
  xor,
  distinct,
  disjoint,
  cumulative,
  allowed,
} from "./boolean-expr.js";
export {
  parseExpr,
  parseConstraint,
  expr,
  type ParsedExpr,
  type ExprResolver,
  type ExprContainerLeaf,
  type ExprRecordContainer,
  type ExprMapperFn,
  type ExprInterpolation,
} from "./parser.js";
export {
  generateLpString,
  buildLpSymbolMaps,
  isLpExportResult,
  sanitizeIdentifier,
  type LpModelData,
  type LpSymbolMaps,
  type LpExportResult,
} from "./lp-writer.js";
export {
  type VerifyOptions,
  type ViolationType,
  type VerificationViolation,
  type VerificationSummary,
  type VerificationReport,
} from "./solution-validator.js";

// Type definitions
export type {
  VarType,
  OptimizationSense,
  ComparisonSense,
  SolverStatus,
  TerminationStatus,
  SolveProgressEvent,
  SolveOptions,
  SolverSolution,
  CheckResult,
  ColumnDefinition,
} from "./types.js";

// Pluggable Solvers Architecture (HiGHS, Pumpkin, Z3, GLPK, Remote, Mock, Custom)
export * from "./solvers/index.js";
