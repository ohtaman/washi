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
  Var,
  type VarOptions,
  LinExpr,
  sum,
  xsum,
  lpSum,
  QuadExpr,
  type QuadTerm,
  Constraint,
  parseExpr,
  parseConstraint,
  expr,
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

// PuLP-compatible API (LpProblem, LpVariable, etc.)
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
} from "./modeler/pulp-compat.js";

// python-mip-compatible API (MipModel, MINIMIZE, etc.)
export {
  MipModel,
  MINIMIZE,
  MAXIMIZE,
  CONTINUOUS,
  INTEGER,
  BINARY,
  maximize,
  minimize,
} from "./modeler/mip-compat.js";

// Solvers & Extensibility Architecture
export {
  type Solver,
  type SolverOptions,
  type SolverResult,
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
export { getHighs, solveLpWithHighs, setHighsWasmUrl } from "./highs-loader.js";
