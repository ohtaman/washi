import type {
  OptimizationSense,
  SolverStatus,
  TerminationStatus,
  SolveProgressEvent,
} from "../types.js";
import type { Var } from "../variable.js";
import type { LinExpr } from "../expression.js";
import type { QuadExpr } from "../quad-expr.js";
import type { Constraint } from "../constraint.js";
import type { BoolVar, LogicElement } from "../boolean-expr.js";

/**
 * Named logical constraint entry in a model snapshot.
 */
export interface LogicalConstraintItem {
  name: string;
  expr: LogicElement;
}

/**
 * Typed model snapshot passed to `Solver.check()` (objective-free satisfiability / feasibility).
 *
 * Each entity in `variables`, `boolVars`, and `constraints` carries its own model-unique
 * `.name` (and numeric `.id`), while `logicalConstraints` entries carry their `.name` and
 * AST `.expr`. Adapters should key returned `values`, `duals`, `reducedCosts`, `slacks`,
 * and `unsatCore` by these canonical model names (`v.name`, `bv.name`, `c.name`, `lc.name`),
 * keeping any backend-specific identifier sanitization internal to the adapter.
 */
export interface CheckModelData {
  name?: string;
  variables: Var[];
  boolVars?: BoolVar[];
  constraints: Constraint[];
  logicalConstraints?: LogicalConstraintItem[];
}

/**
 * Typed model snapshot passed to `Solver.solve()` (optimization with an objective).
 */
export interface SolveModelData extends CheckModelData {
  sense: OptimizationSense;
  objective: LinExpr | QuadExpr;
}

/**
 * Normalized solution result returned by any solver adapter
 */
export interface SolverResult {
  status: SolverStatus;
  /** Exact termination reason independent of whether a feasible incumbent is available */
  terminationStatus?: TerminationStatus;
  /** Whether a feasible primal solution / incumbent is available */
  hasPrimalSolution?: boolean;
  objectiveValue: number | null;
  /** Best proven dual/objective bound when provided by the solver */
  objectiveBound?: number;
  /** Relative MIP optimality gap when provided by the solver */
  relGap?: number;
  /** Alias for relGap: relative MIP optimality gap when provided by the solver */
  mipGap?: number;
  /** Absolute MIP optimality gap |objectiveValue - objectiveBound| when provided by the solver */
  absGap?: number;
  /** Variable primal values (keyed by canonical variable name) */
  values: Record<string, number>;
  /** Boolean variable assignments (optional, keyed by canonical BoolVar name) */
  boolValues?: Record<string, boolean>;
  /** Variable reduced costs (optional, keyed by canonical variable name) */
  reducedCosts?: Record<string, number>;
  /** Constraint dual values (optional, keyed by canonical constraint name) */
  duals?: Record<string, number>;
  /** Constraint slacks (optional, keyed by canonical constraint name) */
  slacks?: Record<string, number>;
  /** Solution time in seconds */
  runTime?: number;
  /** Raw solver output or diagnostic logs */
  logs?: string[];
  raw?: any;
}

/**
 * Common solver options supported across solvers
 */
export interface SolverOptions {
  /** Maximum solve time limit in seconds */
  timeLimit?: number;
  /** Presolve mode */
  presolve?: "on" | "off" | "choose";
  /** Relative MIP gap tolerance (e.g. 0.01 for 1%) */
  mipGap?: number;
  /** Relative MIP gap tolerance alias */
  relGap?: number;
  /** Absolute MIP gap tolerance */
  absGap?: number;
  /** Number of parallel threads */
  threads?: number;
  /** Enable verbose solver logging */
  verbose?: boolean;
  /** Use Web Worker for non-blocking browser execution */
  useWorker?: boolean;
  /** AbortSignal to cancel an in-flight solve */
  signal?: AbortSignal;
  /** Callback invoked with real solver progress metrics when available */
  onProgress?: (progress: SolveProgressEvent) => void;
  /** Additional solver-specific options */
  [key: string]: any;
}

/**
 * Problem classes and features supported by a solver engine
 */
export interface SolverCapabilities {
  /** Supports mixed-integer programming (integer/binary variables) */
  supportsMIP?: boolean;
  /** Supports quadratic objectives (QP) */
  supportsQP?: boolean;
  /** Supports quadratic constraints (QCQP / SOCP) */
  supportsQCQP?: boolean;
  /** Supports satisfiability modulo theories / logical constraints */
  supportsSMT?: boolean;
  /** Supports extracting an unsatisfiable core (conflicting constraint subset; minimality is not guaranteed) */
  supportsUnsatCore?: boolean;
  /** Supports primal initial values (MIP starts / warm-start hints) */
  supportsWarmStart?: boolean;
}

export interface SolverCheckResult {
  status: "Sat" | "Unsat" | "Unknown";
  values: Record<string, number | boolean>;
  unsatCore?: readonly string[];
  /** Alias for unsatCore: subset of conflicting constraints causing infeasibility */
  conflicts?: readonly string[];
  runTime?: number;
  logs?: string[];
  raw?: any;
}

/**
 * Universal Solver interface.
 * Any optimization engine (HiGHS WASM, GLPK, Z3, Gurobi Remote, CBC, SCIP, custom JS)
 * implements this interface to be used interchangeably with Model.
 */
export interface Solver {
  /** Identifier name of the solver engine */
  readonly name: string;
  /** Version string of the solver */
  readonly version?: string;
  /** Feature capabilities of this solver */
  readonly capabilities?: SolverCapabilities;
  /**
   * Solve the given mathematical programming model data
   */
  solve(
    modelData: SolveModelData,
    options?: SolverOptions
  ): Promise<SolverResult>;
  /**
   * Check satisfiability of the model and logical constraints without an objective (optional)
   */
  check?(
    modelData: CheckModelData,
    options?: SolverOptions
  ): Promise<SolverCheckResult>;
}

