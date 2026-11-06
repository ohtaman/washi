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
  type BinaryOptions,
  type IndicatorOptions,
  type ConstraintItem,
  type KeyCollection,
  deriveBigMForLe,
  deriveBigMForGe,
  validateUserBigM,
  buildIndicatorLinearization,
  linearizeModelForMip,
  type LinearizationResult,
  validateModelIntegrity,
  maximize,
  minimize,
  type ObjectiveExpr,
  type ObjectiveSpec,
  Var,
  type VarOptions,
  LinExpr,
  QuadExpr,
  type Expr,
  type DotTerm,
  type DotVarContainer,
  type DotCoeffContainer,
  type QuadTerm,
  sum,
  dot,
  Constraint,
  BoolVar,
  BoolExpr,
  BoolOp,
  type LogicElement,
  type LogicInput,
  and,
  or,
  not,
  implies,
  xor,
  parseExpr,
  parseConstraint,
  expr,
  type ParsedExpr,
  type ExprResolver,
  generateLpString,
  buildLpSymbolMaps,
  isLpExportResult,
  sanitizeIdentifier,
  type LpModelData,
  type LpSymbolMaps,
  type LpExportResult,
  validateModelSolution,
  type SolutionValidationOptions,
  type ViolationType,
  type SolutionViolation,
  type SolutionValidationSummary,
  type SolutionValidationReport,
} from "./modeler/index.js";

export {
  normalizeSense,
  type VarType,
  type OptimizationSense,
  type ComparisonSense,
  type SolverStatus,
  type TerminationStatus,
  type SolveProgressEvent,
  type SolveOptions,
  type SolverSolution,
  type CheckResult,
  type ColumnDefinition,
} from "./modeler/types.js";

// Advanced Decomposition Methods (Column Generation, Benders Decomposition)
export {
  solveColumnGeneration,
  solveBenders,
  type ColumnProposal,
  type PricingContext,
  type ColumnGenerationIterationInfo,
  type ColumnGenerationOptions,
  type ColumnGenerationResult,
  type ColumnLinkOptions,
  type DeclarativeSubproblem,
  type BendersCut,
  type BendersSubproblemContext,
  type BendersIterationInfo,
  type BendersOptions,
  type BendersResult,
} from "./decomposition/index.js";


// Solvers & Extensibility Architecture
export {
  type Solver,
  type SolverOptions,
  type SolverResult,
  type SolverCheckResult,
  type SolverCapabilities,
  type SolveModelData,
  type CheckModelData,
  type LogicalConstraintItem,
  HighsSolver,
  HiGHS,
  MockSolver,
  type MockSolverOptions,
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
  Highs,
  type HighsSolutionResult,
  type HighsSolutionColumn,
  type HighsSolutionRow,
} from "./modeler/solvers/highs/index.js";

