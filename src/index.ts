/**
 * WaSHI: Modern Mathematical Optimization Modeler for TypeScript & JavaScript
 * 
 * Domain-pure algebraic modeling with WebAssembly (HiGHS, Z3, GLPK) and pluggable solvers.
 * Supports LP (Linear Programming), MIP (Mixed-Integer Programming), QP (Quadratic Programming), and SMT.
 */

// Core Algebraic Modeler
export {
  Model,
  type ModelOptions,
  type BoundsOptions,
  type ConstraintItem,
  maximize,
  minimize,
  type ObjectiveExpr,
  type ObjectiveSpec,
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

export {
  normalizeSense,
  type VarType,
  type OptimizationSense,
  type ComparisonSense,
  type SolverStatus,
  type SolveOptions,
  type SolverSolution,
  type CheckResult,
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

