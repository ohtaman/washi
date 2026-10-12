/**
 * opt-ts: Modern Mathematical Optimization Modeler for TypeScript & JavaScript
 * 
 * Elegant PuLP/python-mip style modeling with WebAssembly (HiGHS) and pluggable solvers.
 * Supports LP (Linear Programming), MIP (Mixed-Integer Programming), and QP (Quadratic Programming).
 */

// Core Algebraic Modeler
export {
  Model,
  type ModelOptions,
  type BoundsOptions,
  Var,
  type VarOptions,
  LinExpr,
  QuadExpr,
  type Expr,
  type QuadTerm,
  sum,
  dot,
  Constraint,
  BoolVar,
  BoolExpr,
  BoolOp,
  and,
  or,
  not,
  implies,
  xor,
  parseExpr,
  parseConstraint,
  expr,
  c,
  generateLpString,
  type LpModelData,
  type LpExportResult,
} from "./modeler/index.js";

// Core Types
export type {
  VarType,
  OptimizationSense,
  ComparisonSense,
  SolverStatus,
  SolveOptions,
  SolverSolution,
} from "./modeler/types.js";


// Solvers & Extensibility Architecture
export {
  type Solver,
  type SolverOptions,
  type SolverResult,
  type SolverCheckResult,
  type SolverCapabilities,
  HighsSolver,
  HiGHS,
  MockSolver,
  registerSolver,
  getSolver,
  setDefaultSolver,
  listAvailableSolvers,
} from "./modeler/solvers/index.js";

// WASM Engine Access
export {
  getHighs,
  solveLpWithHighs,
  setHighsWasmUrl,
  getHighsWasmUrl,
  OFFICIAL_HIGHS_CDN_WASM_URL,
  isValidWasmHeader,
  probeWasmUrl,
  resolveBrowserWasmUrl,
} from "./modeler/solvers/highs/index.js";

