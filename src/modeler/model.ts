import {
  type VarType,
  type OptimizationSense,
  normalizeSense,
  type SolverStatus,
  type TerminationStatus,
  type SolveOptions,
  type SolverSolution,
  type CheckResult,
} from "./types.js";
import { type ObjectiveSpec } from "./objective.js";
import { Var, type VarOptions } from "./variable.js";
import { LinExpr } from "./expression.js";
import { QuadExpr } from "./quad-expr.js";
import { Constraint } from "./constraint.js";
import { BoolVar, BoolExpr, BoolOp, type LogicElement } from "./boolean-expr.js";
import { parseExpr, parseConstraint } from "./parser.js";
import { generateLpString, type LpExportResult } from "./lp-writer.js";
import { getSolver, type Solver, type SolverOptions, type SolverResult } from "./solvers/index.js";

/**
 * Valid items that can be added as a constraint to a model.
 * Raw mathematical expressions (LinExpr, QuadExpr) without comparisons are strictly prohibited.
 */
export type ConstraintItem = Constraint | BoolExpr | string;

export interface ModelOptions {
  name?: string;
  sense?: OptimizationSense;
  solver?: Solver | string;
}

export interface BoundsOptions {
  name?: string;
  prefix?: string;
  lb?: number;
  ub?: number;
}

import {
  type IndicatorOptions,
  deriveBigMForLe,
  deriveBigMForGe,
  validateUserBigM,
  buildIndicatorLinearization,
} from "./big-m.js";
import {
  claimConstraintOwnership,
  claimVarOwnership,
  validateLinearConstraint,
  validateLogicElement,
  validateModelIntegrity,
  validateObjectiveExpr,
  validateVarBounds,
} from "./validation.js";
export type { IndicatorOptions };

/**
 * High-level mathematical programming model for LP, MIP, QP, and SMT,
 * running directly with WebAssembly solvers (HiGHS, Z3, GLPK) in browser and Node.js.
 */
export interface LogicalConstraint {
  name: string;
  expr: BoolExpr | Constraint;
}

export class Model {
  public name: string;
  public sense: OptimizationSense;
  public objectiveExpr: LinExpr | QuadExpr;
  public variables: Var[] = [];
  public constraints: Constraint[] = [];
  public boolVars: BoolVar[] = [];
  public logicalConstraints: LogicalConstraint[] = [];
  public unsatCore: readonly string[] | undefined = undefined;

  /**
   * User-friendly alias for unsatCore.
   * Returns a subset of conflicting constraint names causing infeasibility,
   * or undefined if not diagnosed, not applicable, or satisfiable.
   */
  get conflicts(): readonly string[] | undefined {
    return this.unsatCore;
  }

  public values = new Map<string, number | boolean>();

  private varMapByName = new Map<string, Var>();
  private varPrefixCounters = new Map<string, number>();
  private boolVarMapByName = new Map<string, BoolVar>();
  private boolVarPrefixCounters = new Map<string, number>();
  private constrMapByName = new Map<string, Constraint>();
  private constrPrefixCounters = new Map<string, number>();
  private logicalConstrMapByName = new Map<string, LogicalConstraint>();
  private logicalConstrCounter = 0;

  public status: SolverStatus = "NotSolved";
  public terminationStatus: TerminationStatus = "NotSolved";
  public hasPrimalSolution: boolean = false;
  public objectiveValue: number | null = null;
  public objectiveBound: number | undefined = undefined;
  public relGap: number | undefined = undefined;
  public mipGap: number | undefined = undefined;
  public absGap: number | undefined = undefined;
  public runTime: number = 0;
  public solution: SolverSolution | null = null;
  public solver: Solver | null = null;
  private hasSolutionState: boolean = false;

  constructor(nameOrOptions: string | ModelOptions = {}, maybeOptions?: ModelOptions) {
    let options: ModelOptions;
    if (typeof nameOrOptions === "string") {
      options = { ...maybeOptions, name: nameOrOptions };
    } else {
      options = nameOrOptions;
    }
    this.name = options.name || "OptimizationModel";
    this.sense = normalizeSense(options.sense);
    this.objectiveExpr = new LinExpr();
    if (options.solver) {
      this.solver = getSolver(options.solver);
    }
  }

  get vars(): Var[] {
    return this.variables;
  }

  get constrs(): Constraint[] {
    return this.constraints;
  }

  get numVars(): number {
    return this.variables.length;
  }

  get numConstrs(): number {
    return this.constraints.length;
  }

  /**
   * Reset prior solution and diagnostic state to avoid stale data leakage across runs.
   * Skips redundant O(N) traversals if the model is already in an unsolved / invalidated state.
   */
  public resetSolutionState(): void {
    if (
      !this.hasSolutionState &&
      this.status === "NotSolved" &&
      this.terminationStatus === "NotSolved" &&
      !this.hasPrimalSolution &&
      this.solution === null &&
      this.unsatCore === undefined
    ) {
      return;
    }
    this.status = "NotSolved";
    this.terminationStatus = "NotSolved";
    this.hasPrimalSolution = false;
    this.objectiveValue = null;
    this.objectiveBound = undefined;
    this.relGap = undefined;
    this.mipGap = undefined;
    this.absGap = undefined;
    this.solution = null;
    this.runTime = 0;
    this.unsatCore = undefined;
    this.values.clear();
    for (const v of this.variables) {
      v.value = null;
      v.reducedCost = null;
    }
    for (const bv of this.boolVars) {
      bv.value = null;
    }
    for (const c of this.constraints) {
      c.dual = null;
      c.slack = null;
    }
    this.hasSolutionState = false;
  }

  /**
   * Internal generator for domain-specific variables
   */
  private createDomainVars(
    domainType: "Binary" | "Integer" | "Continuous",
    arg1: any,
    arg2?: any,
    arg3?: any
  ): any {
    // 2D case: arg2 is number or array
    if (typeof arg2 === "number" || Array.isArray(arg2)) {
      const rows = typeof arg1 === "number" ? Array.from({ length: arg1 }, (_, i) => i) : arg1;
      const cols = typeof arg2 === "number" ? Array.from({ length: arg2 }, (_, i) => i) : arg2;
      const opts = arg3 || {};
      const prefix = opts.prefix || opts.name || "x";
      const matrix: any = {};
      for (const r of rows) {
        matrix[r] = {};
        for (const c of cols) {
          matrix[r][c] = this.addVar({
            ...opts,
            type: domainType,
            name: `${prefix}_${r}_${c}`,
          });
        }
      }
      return matrix;
    }

    // 1D single variable: arg1 is string, undefined, or options object
    if (typeof arg1 === "string" || arg1 === undefined) {
      const opts = (arg2 as BoundsOptions) || {};
      const explicitName = typeof arg1 === "string" ? arg1 : opts.name;
      return this.addVar({
        ...opts,
        type: domainType,
        name: explicitName,
      });
    }
    if (typeof arg1 === "object" && !Array.isArray(arg1) && typeof (arg1 as any)[Symbol.iterator] !== "function") {
      const opts = arg1 as BoundsOptions;
      return this.addVar({
        ...opts,
        type: domainType,
      });
    }

    // 1D multiple variables: count (number) or keys (array/iterable)
    const opts = (arg2 as BoundsOptions) || {};
    const prefix = opts.prefix || opts.name;
    if (typeof arg1 === "number") {
      const result: Var[] = [];
      const p = prefix || "x";
      for (let i = 0; i < arg1; i++) {
        result.push(
          this.addVar({
            ...opts,
            type: domainType,
            name: undefined,
            prefix: p,
          })
        );
      }
      return result;
    } else if (Array.isArray(arg1) || (arg1 && typeof (arg1 as any)[Symbol.iterator] === "function")) {
      const result: Record<string, Var> = {};
      for (const key of arg1) {
        const varName = prefix ? `${prefix}_${key}` : `${key}`;
        result[key] = this.addVar({
          ...opts,
          type: domainType,
          name: varName,
        });
      }
      return result;
    }

    throw new Error(`Invalid arguments provided for ${domainType.toLowerCase()} variable creation`);
  }

  /**
   * Create 0-1 binary variable(s) (x in {0, 1}).
   * Supports:
   * - m.binary("x") -> Var
   * - m.binary() -> Var
   * - m.binary(5) -> Var[]
   * - m.binary(["a", "b"]) -> Record<string, Var>
   * - m.binary(rows, cols) -> Record<string, Record<string, Var>>
   */
  binary(name?: string, options?: { prefix?: string; name?: string }): Var;
  binary(options: { prefix?: string; name?: string }): Var;
  binary(count: number, options?: { prefix?: string; name?: string }): Var[];
  binary<K extends string | number>(
    keys: K[] | Iterable<K>,
    options?: { prefix?: string; name?: string }
  ): Record<K, Var>;
  binary<R extends string | number, C extends string | number>(
    dim1: R[] | number,
    dim2: C[] | number,
    options?: { prefix?: string; name?: string }
  ): Record<R, Record<C, Var>>;
  binary(arg1?: any, arg2?: any, arg3?: any): any {
    return this.createDomainVars("Binary", arg1, arg2, arg3);
  }

  /**
   * Create integer variable(s) (y in Z).
   * Supports:
   * - m.integer("y", { lb: 0, ub: 10 }) -> Var
   * - m.integer({ lb: 0, ub: 10 }) -> Var
   * - m.integer(5, { lb: 0 }) -> Var[]
   * - m.integer(["a", "b"], { lb: 0, ub: 5 }) -> Record<string, Var>
   * - m.integer(rows, cols, options) -> Record<string, Record<string, Var>>
   */
  integer(name?: string, options?: BoundsOptions): Var;
  integer(options: BoundsOptions): Var;
  integer(count: number, options?: BoundsOptions): Var[];
  integer<K extends string | number>(
    keys: K[] | Iterable<K>,
    options?: BoundsOptions
  ): Record<K, Var>;
  integer<R extends string | number, C extends string | number>(
    dim1: R[] | number,
    dim2: C[] | number,
    options?: BoundsOptions
  ): Record<R, Record<C, Var>>;
  integer(arg1?: any, arg2?: any, arg3?: any): any {
    return this.createDomainVars("Integer", arg1, arg2, arg3);
  }

  /**
   * Create continuous (real) variable(s) (z in R).
   * Supports:
   * - m.continuous("z", { lb: 0 }) -> Var
   * - m.continuous({ lb: 0 }) -> Var
   * - m.continuous(5, { lb: 0 }) -> Var[]
   * - m.continuous(["a", "b"], { lb: 0 }) -> Record<string, Var>
   * - m.continuous(rows, cols, options) -> Record<string, Record<string, Var>>
   */
  continuous(name?: string, options?: BoundsOptions): Var;
  continuous(options: BoundsOptions): Var;
  continuous(count: number, options?: BoundsOptions): Var[];
  continuous<K extends string | number>(
    keys: K[] | Iterable<K>,
    options?: BoundsOptions
  ): Record<K, Var>;
  continuous<R extends string | number, C extends string | number>(
    dim1: R[] | number,
    dim2: C[] | number,
    options?: BoundsOptions
  ): Record<R, Record<C, Var>>;
  continuous(arg1?: any, arg2?: any, arg3?: any): any {
    return this.createDomainVars("Continuous", arg1, arg2, arg3);
  }

  /**
   * Create Boolean (propositional logic) variable(s) for SMT / SAT modeling.
   * Supports:
   * - m.bool("isNight") -> BoolVar
   * - m.bool() -> BoolVar
   * - m.bool(5) -> BoolVar[]
   * - m.bool(["flagA", "flagB"]) -> Record<string, BoolVar>
   * - m.bool(rows, cols) -> Record<string, Record<string, BoolVar>>
   */
  bool(name?: string, options?: { prefix?: string; name?: string }): BoolVar;
  bool(options: { prefix?: string; name?: string }): BoolVar;
  bool(count: number, options?: { prefix?: string; name?: string }): BoolVar[];
  bool<K extends string | number>(
    keys: K[] | Iterable<K>,
    options?: { prefix?: string; name?: string }
  ): Record<K, BoolVar>;
  bool<R extends string | number, C extends string | number>(
    dim1: R[] | number,
    dim2: C[] | number,
    options?: { prefix?: string; name?: string }
  ): Record<R, Record<C, BoolVar>>;
  bool(arg1?: any, arg2?: any, arg3?: any): any {
    // 2D case: arg2 is number or array
    if (typeof arg2 === "number" || Array.isArray(arg2)) {
      const rows = typeof arg1 === "number" ? Array.from({ length: arg1 }, (_, i) => i) : arg1;
      const cols = typeof arg2 === "number" ? Array.from({ length: arg2 }, (_, i) => i) : arg2;
      const opts = arg3 || {};
      const prefix = opts.prefix || opts.name || "p";
      const matrix: any = {};
      for (const r of rows) {
        matrix[r] = {};
        for (const c of cols) {
          matrix[r][c] = this.createBoolVar(`${prefix}_${r}_${c}`);
        }
      }
      return matrix;
    }

    // 1D single variable or options object
    if (typeof arg1 === "string" || arg1 === undefined) {
      const opts = (arg2 as { prefix?: string; name?: string }) || {};
      const explicitName = typeof arg1 === "string" ? arg1 : opts.name;
      return this.createBoolVar(explicitName, opts.prefix);
    }
    if (typeof arg1 === "object" && !Array.isArray(arg1) && typeof (arg1 as any)[Symbol.iterator] !== "function") {
      const opts = arg1 as { prefix?: string; name?: string };
      return this.createBoolVar(opts.name, opts.prefix);
    }

    // 1D multiple variables: count (number) or keys (array/iterable)
    const opts = (arg2 as { prefix?: string; name?: string }) || {};
    const prefix = opts.prefix || opts.name;
    if (typeof arg1 === "number") {
      const result: BoolVar[] = [];
      const p = prefix || "p";
      for (let i = 0; i < arg1; i++) {
        result.push(this.createBoolVar(undefined, p));
      }
      return result;
    } else if (Array.isArray(arg1) || (arg1 && typeof (arg1 as any)[Symbol.iterator] === "function")) {
      const result: Record<string, BoolVar> = {};
      for (const key of arg1) {
        const varName = prefix ? `${prefix}_${key}` : `${key}`;
        result[key] = this.createBoolVar(varName);
      }
      return result;
    }

    throw new Error("Invalid arguments provided for boolean variable creation");
  }

  private hasVarName(name: string): boolean {
    return this.varMapByName.has(name) || this.boolVarMapByName.has(name);
  }

  private getNextVarName(prefix: string): string {
    let counter = this.varPrefixCounters.get(prefix) ?? 0;
    let candidate = `${prefix}_${counter}`;
    while (this.hasVarName(candidate)) {
      counter++;
      candidate = `${prefix}_${counter}`;
    }
    this.varPrefixCounters.set(prefix, counter + 1);
    return candidate;
  }

  private getNextBoolVarName(prefix: string): string {
    let counter = this.boolVarPrefixCounters.get(prefix) ?? 0;
    let candidate = `${prefix}_${counter}`;
    while (this.hasVarName(candidate) || this.hasConstraintName(candidate)) {
      counter++;
      candidate = `${prefix}_${counter}`;
    }
    this.boolVarPrefixCounters.set(prefix, counter + 1);
    return candidate;
  }

  private hasConstraintName(name: string): boolean {
    return this.constrMapByName.has(name) || this.logicalConstrMapByName.has(name);
  }

  private hasBoolVarName(name: string): boolean {
    return this.boolVarMapByName.has(name);
  }

  private getNextConstrName(prefix: string = "c"): string {
    let counter = this.constrPrefixCounters.get(prefix) ?? 1;
    let candidate = `${prefix}_${counter}`;
    while (this.hasConstraintName(candidate) || this.hasBoolVarName(candidate)) {
      counter++;
      candidate = `${prefix}_${counter}`;
    }
    this.constrPrefixCounters.set(prefix, counter + 1);
    return candidate;
  }

  private getNextLogicalConstrName(): string {
    let counter = this.logicalConstrCounter + 1;
    let candidate = `lc_${counter}`;
    while (this.hasConstraintName(candidate) || this.hasBoolVarName(candidate)) {
      counter++;
      candidate = `lc_${counter}`;
    }
    this.logicalConstrCounter = counter;
    return candidate;
  }

  private createBoolVar(name?: string, prefix?: string): BoolVar {
    const trimmed = typeof name === "string" ? name.trim() : undefined;
    const rawPrefix = typeof prefix === "string" ? prefix.trim() : "";
    const resolvedPrefix = rawPrefix.length > 0 ? rawPrefix : "p";
    const varName = trimmed && trimmed.length > 0 ? trimmed : this.getNextBoolVarName(resolvedPrefix);
    if (this.hasVarName(varName)) {
      throw new Error(`Variable with name '${varName}' already exists in model`);
    }
    if (this.hasConstraintName(varName)) {
      throw new Error(
        `Boolean variable name '${varName}' conflicts with an existing constraint in model`
      );
    }
    const bv = new BoolVar(varName);
    this.boolVars.push(bv);
    this.boolVarMapByName.set(bv.name, bv);
    this.resetSolutionState();
    return bv;
  }

  /**
   * Internal variable creator
   */
  private addVar(options?: VarOptions): Var {
    const opts = options || {};
    const trimmed = typeof opts.name === "string" ? opts.name.trim() : undefined;
    const explicitName = trimmed && trimmed.length > 0 ? trimmed : undefined;
    const rawPrefix = typeof opts.prefix === "string" ? opts.prefix.trim() : "";
    const resolvedPrefix = rawPrefix.length > 0 ? rawPrefix : "x";
    const savedCounter = this.varPrefixCounters.get(resolvedPrefix);
    const name = explicitName ?? this.getNextVarName(resolvedPrefix);

    try {
      // Validate unique name
      if (this.hasVarName(name)) {
        throw new Error(`Variable with name '${name}' already exists in model`);
      }

      const v = new Var({ ...opts, name, prefix: resolvedPrefix });
      v.hasExplicitName = explicitName !== undefined;
      validateVarBounds(v);
      claimVarOwnership(v, this);
      v.ownerModel = this;

      this.variables.push(v);
      this.varMapByName.set(v.name, v);
      this.resetSolutionState();
      return v;
    } catch (err) {
      if (explicitName === undefined) {
        if (savedCounter === undefined) {
          this.varPrefixCounters.delete(resolvedPrefix);
        } else {
          this.varPrefixCounters.set(resolvedPrefix, savedCounter);
        }
      }
      throw err;
    }
  }

  /**
   * Find variable by name
   */
  getVarByName(name: string): Var | undefined {
    return this.varMapByName.get(name);
  }

  /**
   * Find boolean variable by name
   */
  getBoolVarByName(name: string): BoolVar | undefined {
    return this.boolVarMapByName.get(name);
  }

  /**
   * Find a constraint by its name
   */
  getConstraintByName(name: string): Constraint | undefined {
    return this.constrMapByName.get(name);
  }

  /**
   * Find a logical constraint by its name
   */
  getLogicalConstraintByName(name: string): LogicalConstraint | undefined {
    return this.logicalConstrMapByName.get(name);
  }

  /**
   * Get the current objective expression, or set the objective function and direction.
   * Calling objective(spec) replaces any previously defined objective.
   * Chainable when setting: returns this.
   *
   * @example
   * m.objective(maximize(expr`30 * ${chairs} + 50 * ${tables}`));
   * m.objective(minimize(costExpr));
   * const currentExpr = m.objective();
   */
  objective(): LinExpr | QuadExpr;
  objective(spec: ObjectiveSpec): this;
  objective(spec?: ObjectiveSpec): LinExpr | QuadExpr | this {
    if (!spec) {
      return this.objectiveExpr;
    }
    this.setObjective(spec.expr, spec.sense);
    return this;
  }

  /**
   * Set the objective function (classic API).
   * Prefer using `m.objective(maximize(expr))` or `m.objective(minimize(expr))`.
   */
  setObjective(expr: LinExpr | QuadExpr | Var | number | string | Constraint, sense?: OptimizationSense): void {
    if (expr instanceof Constraint) {
      throw new Error(
        "Cannot set objective to a constraint comparison (<=, >=, ==). " +
        "Did you mean to use m.constraint(c`... <= ...`)? For objectives, supply an unconstrained expression like expr`45 * ${x} + 80 * ${y}`."
      );
    }

    const newSense = sense ? normalizeSense(sense) : this.sense;

    let parsedExpr: LinExpr | QuadExpr;
    if (typeof expr === "string") {
      parsedExpr = parseExpr(expr, (name) => this.getVarByName(name));
    } else if (typeof expr === "number") {
      parsedExpr = new LinExpr(new Map(), expr);
    } else if (expr instanceof QuadExpr) {
      parsedExpr = expr.clone();
    } else if ("terms" in expr) {
      parsedExpr = expr.clone();
    } else {
      // Var
      parsedExpr = new LinExpr(new Map([[expr, 1]]), 0);
    }

    // Validate objective numeric inputs and model ownership
    validateObjectiveExpr(parsedExpr, this.name, (v) => this.varMapByName.get(v.name) === v);

    this.sense = newSense;
    this.objectiveExpr = parsedExpr;
    this.resetSolutionState();
  }

  /**
   * @deprecated Use `m.objective(maximize(expr))` and `await m.solve()` instead.
   */
  maximize(expr: LinExpr | QuadExpr | Var | number | string | Constraint): void {
    this.setObjective(expr, "Maximize");
  }

  /**
   * @deprecated Use `m.objective(minimize(expr))` and `await m.solve()` instead.
   */
  minimize(expr: LinExpr | QuadExpr | Var | number | string | Constraint): void {
    this.setObjective(expr, "Minimize");
  }

  /**
   * Add linear, boolean, or string formula constraint(s) to the model.
   * Rejects raw arithmetic expressions (e.g. LinExpr) without comparison operators.
   * Chainable: returns this.
   *
   * @example
   * m.constraint(c`${desks} + 2 * ${chairs} <= 40`, "wood")
   * m.constraint(items.map(i => c`${x[i]} <= 10`))
   * m.constraint(c1).constraint(c2)
   */
  constraint(constraint: ConstraintItem, name?: string): this;
  constraint(constraints: ConstraintItem[]): this;
  constraint(
    item: ConstraintItem | ConstraintItem[],
    name?: string
  ): this {
    if (Array.isArray(item)) {
      for (const elem of item) {
        this.constraint(elem);
      }
      return this;
    }
    if (item instanceof QuadExpr) {
      throw new Error(
        "Cannot add a quadratic expression without a comparison operator (<=, >=, ==) as a constraint. " +
        "Quadratic constraints are not supported (only linear constraints are allowed in MILP/LP/QP)."
      );
    }
    if (item instanceof LinExpr) {
      throw new Error(
        "Cannot add a linear expression without a comparison operator (<=, >=, ==) as a constraint. " +
        "Use c`... <= ...` or .le(), .ge(), .eq()."
      );
    }
    this.addConstraint(item as Constraint | BoolExpr | string, name);
    return this;
  }

  /**
   * @deprecated Use `m.constraint(...)` instead.
   */
  constrain(constraint: ConstraintItem | LinExpr | QuadExpr, name?: string): this;
  constrain(constraints: (ConstraintItem | LinExpr | QuadExpr)[]): this;
  constrain(
    item: any,
    name?: string
  ): this {
    return (this.constraint as any)(item, name);
  }

  /**
   * Extract primal solution values directly into plain primitives:
   * - m.getValues(x) -> number | null
   * - m.getValues(p) -> boolean | null
   * - m.getValues([x, y]) -> (number | null)[]
   * - m.getValues([p, q]) -> (boolean | null)[]
   * - m.getValues(record) -> Record<string, number | boolean | null>
   * - m.getValues(matrix) -> Record<string, Record<string, number | boolean | null>>
   */
  getValues(item: Var): number | null;
  getValues(item: BoolVar): boolean | null;
  getValues(items: Var[]): (number | null)[];
  getValues(items: BoolVar[]): (boolean | null)[];
  getValues<K extends string | number>(items: Record<K, Var>): Record<K, number | null>;
  getValues<K extends string | number>(items: Record<K, BoolVar>): Record<K, boolean | null>;
  getValues<R extends string | number, C extends string | number>(
    items: Record<R, Record<C, Var>>
  ): Record<R, Record<C, number | null>>;
  getValues<R extends string | number, C extends string | number>(
    items: Record<R, Record<C, BoolVar>>
  ): Record<R, Record<C, boolean | null>>;
  getValues(items: any): any {
    if (items === null || items === undefined) return null;
    if (items instanceof Var || items instanceof BoolVar) {
      return items.value;
    }
    if (Array.isArray(items)) {
      return items.map((v) => this.getValues(v));
    }
    if (typeof items === "object") {
      const res: any = {};
      for (const [k, v] of Object.entries(items)) {
        res[k] = this.getValues(v as any);
      }
      return res;
    }
    return null;
  }

  /**
   * Internal linear or logical constraint adder
   */
  private addConstraint(constraint: Constraint | LinExpr | QuadExpr | string, name?: string): Constraint;
  private addConstraint(constraint: BoolExpr, name?: string): BoolExpr;
  private addConstraint(constraint: Constraint | LinExpr | QuadExpr | BoolExpr | string, name?: string): Constraint | BoolExpr;
  private addConstraint(constraint: Constraint | LinExpr | QuadExpr | BoolExpr | string, name?: string): Constraint | BoolExpr {
    if (constraint instanceof QuadExpr) {
      throw new Error(
        "Cannot add a quadratic expression without a comparison operator (<=, >=, ==) as a constraint. " +
        "Quadratic constraints are not supported (only linear constraints are allowed in MILP/LP/QP)."
      );
    }
    if (constraint instanceof LinExpr) {
      throw new Error(
        "Cannot add a linear expression without a comparison operator (<=, >=, ==) as a constraint. " +
        "Use c`... <= ...` or .le(), .ge(), .eq()."
      );
    }
    if (constraint instanceof BoolExpr) {
      const explicitName = typeof name === "string" && name.trim().length > 0 ? name.trim() : undefined;
      if (explicitName !== undefined) {
        if (this.hasConstraintName(explicitName)) {
          throw new Error(`Constraint with name '${explicitName}' already exists in model`);
        }
        if (this.hasBoolVarName(explicitName)) {
          throw new Error(
            `Constraint name '${explicitName}' conflicts with an existing Boolean variable in model`
          );
        }
      }
      const savedLogicalCounter = this.logicalConstrCounter;
      const constrName = explicitName ?? this.getNextLogicalConstrName();
      try {
        validateLogicElement(
          constraint,
          constrName,
          this.name,
          (v) => this.varMapByName.get(v.name) === v,
          (bv) => this.boolVarMapByName.get(bv.name) === bv
        );
      } catch (err) {
        if (explicitName === undefined) {
          this.logicalConstrCounter = savedLogicalCounter;
        }
        throw err;
      }

      const lcEntry: LogicalConstraint = {
        name: constrName,
        expr: constraint,
      };
      this.logicalConstraints.push(lcEntry);
      this.logicalConstrMapByName.set(constrName, lcEntry);
      this.resetSolutionState();
      return constraint;
    }

    const constr =
      typeof constraint === "string"
        ? parseConstraint(constraint, (varName) => this.getVarByName(varName), name)
        : constraint;

    const explicitName =
      typeof name === "string" && name.trim().length > 0
        ? name.trim()
        : constr.hasExplicitName
        ? constr.name.trim()
        : undefined;
    if (explicitName !== undefined) {
      if (this.hasConstraintName(explicitName)) {
        throw new Error(`Constraint with name '${explicitName}' already exists in model`);
      }
      if (this.hasBoolVarName(explicitName)) {
        throw new Error(
          `Constraint name '${explicitName}' conflicts with an existing Boolean variable in model`
        );
      }
    }

    const savedCounter = this.constrPrefixCounters.get("c");
    const resolvedName = explicitName ?? this.getNextConstrName("c");
    try {
      validateLinearConstraint(constr, this.name, (v) => this.varMapByName.get(v.name) === v, resolvedName);
      claimConstraintOwnership(constr, this);
    } catch (err) {
      if (explicitName === undefined) {
        if (savedCounter === undefined) {
          this.constrPrefixCounters.delete("c");
        } else {
          this.constrPrefixCounters.set("c", savedCounter);
        }
      }
      throw err;
    }

    constr.name = resolvedName;
    constr.hasExplicitName = true;
    this.constraints.push(constr);
    this.constrMapByName.set(constr.name, constr);
    this.resetSolutionState();
    return constr;
  }

  /**
   * Universal classical fluent adder for constraints, variables, or batches.
   * Enables:
   * - m.add(x.mul(2).add(y).le(10))
   * - m.add(c`${x} + ${y} <= 10`)
   * - m.add("x + y <= 10")
   * - m.add([c1, c2, c3])
   * - m.add(new Var(...))
   * - m.add(c1).add(c2) (fluent chaining)
   */
  add(constraint: Constraint, name?: string): this;
  add(expr: BoolExpr, name?: string): this;
  add(strConstraint: string, name?: string): this;
  add(variable: Var): this;
  add(items: (Constraint | BoolExpr | string | Var)[]): this;
  add(
    item: Constraint | BoolExpr | string | Var | (Constraint | BoolExpr | string | Var)[],
    name?: string
  ): this {
    if (Array.isArray(item)) {
      for (const elem of item) {
        this.add(elem as any);
      }
      return this;
    }

    if (item instanceof Var) {
      if (item.ownerModel === this || this.varMapByName.get(item.name) === item) {
        return this;
      }
      validateVarBounds(item);
      if (item.ownerModel !== null && item.ownerModel !== this) {
        claimVarOwnership(item, this);
        throw new Error(
          `Variable "${item.name}" already belongs to another model and cannot be shared across models.`
        );
      }
      const savedCounter = this.varPrefixCounters.get(item.prefix);
      const resolvedName = item.hasExplicitName ? item.name.trim() : this.getNextVarName(item.prefix);
      try {
        if (this.hasVarName(resolvedName)) {
          throw new Error(`Variable with name '${resolvedName}' already exists in model`);
        }
        claimVarOwnership(item, this);
      } catch (err) {
        if (!item.hasExplicitName) {
          if (savedCounter === undefined) {
            this.varPrefixCounters.delete(item.prefix);
          } else {
            this.varPrefixCounters.set(item.prefix, savedCounter);
          }
        }
        throw err;
      }
      item._assignModelName(resolvedName);
      item.ownerModel = this;
      this.variables.push(item);
      this.varMapByName.set(item.name, item);
      this.resetSolutionState();
      return this;
    }

    this.addConstraint(item, name);
    return this;
  }

  /**
   * Add an indicator constraint via Big-M auto-linearization:
   * "If binVar == activeValue, then constraint holds"
   *
   * Automatically handles <=, >=, and == constraints.
   * Enables solving conditional logic in MIP solvers (HiGHS, GLPK) without requiring SMT.
   */
  indicator(
    binVar: Var,
    constraint: Constraint | LinExpr | QuadExpr,
    options: IndicatorOptions = {}
  ): Constraint[] {
    if (!(binVar instanceof Var)) {
      throw new Error(
        "Invalid binary variable passed to indicator(). Expected a binary Var instance."
      );
    }
    const isBinary =
      binVar.type === "Binary" ||
      (binVar.type as string) === "BINARY" ||
      ((binVar.type === "Integer" || (binVar.type as string) === "INTEGER") &&
        binVar.lb === 0 &&
        binVar.ub === 1);
    if (!isBinary) {
      throw new Error(
        `Invalid variable "${binVar.name}" passed to indicator(): variable has type "${binVar.type}" with bounds [${binVar.lb}, ${binVar.ub}]. Indicator activation variable must be a Binary variable (or Integer variable with bounds [0, 1]).`
      );
    }

    if (constraint instanceof QuadExpr) {
      throw new Error(
        "Quadratic expressions or constraints are not supported in indicator constraints (only linear constraints are allowed)."
      );
    }
    if (!("sense" in constraint) || !("lhs" in constraint)) {
      throw new Error(
        "Invalid constraint expression passed to indicator(). Expression must include a comparison operator (<=, >=, ==)."
      );
    }
    const resolvedConstraint = constraint as Constraint;
    const activeVal = options.activeValue !== undefined ? options.activeValue : 1;
    if (activeVal !== 0 && activeVal !== 1) {
      throw new Error(
        `Invalid activeValue: ${activeVal}. Indicator activeValue must be 0 or 1.`
      );
    }
    if (this.varMapByName.get(binVar.name) !== binVar) {
      throw new Error(
        `Variable "${binVar.name}" passed to indicator() does not belong to model "${this.name}". All variables must belong to the model by object identity.`
      );
    }

    const explicitOptName =
      typeof options.name === "string" && options.name.trim().length > 0
        ? options.name.trim()
        : undefined;
    const savedCounter = this.constrPrefixCounters.get("c");
    const { lhs, sense, rhs } = resolvedConstraint;

    let baseName: string;
    let leName: string;
    let geName: string;
    if (explicitOptName !== undefined) {
      baseName = explicitOptName;
      leName = sense === "==" ? `${baseName}_le` : baseName;
      geName = sense === "==" ? `${baseName}_ge` : baseName;
    } else if (resolvedConstraint.hasExplicitName) {
      baseName = `ind_${binVar.name}_${resolvedConstraint.name.trim()}`;
      leName = sense === "==" ? `${baseName}_le` : baseName;
      geName = sense === "==" ? `${baseName}_ge` : baseName;
    } else {
      do {
        const targetConstrName = this.getNextConstrName("c");
        baseName = `ind_${binVar.name}_${targetConstrName}`;
        leName = sense === "==" ? `${baseName}_le` : baseName;
        geName = sense === "==" ? `${baseName}_ge` : baseName;
      } while (
        ((sense === "<=" || sense === "==") && (this.hasConstraintName(leName) || this.hasBoolVarName(leName))) ||
        ((sense === ">=" || sense === "==") && (this.hasConstraintName(geName) || this.hasBoolVarName(geName)))
      );
    }

    const pending: Array<[Constraint, string]> = [];
    try {
      if ((sense === "<=" || sense === "==") && (this.hasConstraintName(leName) || this.hasBoolVarName(leName))) {
        throw new Error(
          this.hasBoolVarName(leName)
            ? `Constraint name '${leName}' conflicts with an existing Boolean variable in model`
            : `Constraint with name '${leName}' already exists in model`
        );
      }
      if ((sense === ">=" || sense === "==") && (this.hasConstraintName(geName) || this.hasBoolVarName(geName))) {
        throw new Error(
          this.hasBoolVarName(geName)
            ? `Constraint name '${geName}' conflicts with an existing Boolean variable in model`
            : `Constraint with name '${geName}' already exists in model`
        );
      }
      if (options.M !== undefined) {
        validateUserBigM(options.M, baseName);
      }

      const isOwnedVar = (v: Var) => this.varMapByName.get(v.name) === v;
      for (const [v] of lhs.terms) {
        if (!isOwnedVar(v)) {
          throw new Error(
            `Variable "${v.name}" in constraint "${baseName}" does not belong to model "${this.name}". All variables must belong to the model by object identity.`
          );
        }
      }

      if (sense === "<=" || sense === "==") {
        const mLe = options.M !== undefined ? options.M : deriveBigMForLe(lhs, rhs, leName);
        const leLinearized = buildIndicatorLinearization(binVar, lhs, "<=", rhs, activeVal, mLe, leName);
        pending.push([new Constraint(leLinearized.lhs, "<=", leLinearized.rhs, leName), leName]);
      }
      if (sense === ">=" || sense === "==") {
        const mGe = options.M !== undefined ? options.M : deriveBigMForGe(lhs, rhs, geName);
        const geLinearized = buildIndicatorLinearization(binVar, lhs, ">=", rhs, activeVal, mGe, geName);
        pending.push([new Constraint(geLinearized.lhs, ">=", geLinearized.rhs, geName), geName]);
      }

      for (const [cRow, rowName] of pending) {
        validateLinearConstraint(cRow, this.name, isOwnedVar, rowName);
      }
    } catch (err) {
      if (savedCounter === undefined) {
        this.constrPrefixCounters.delete("c");
      } else {
        this.constrPrefixCounters.set("c", savedCounter);
      }
      throw err;
    }

    return pending.map(([cRow, rowName]) => this.addConstraint(cRow, rowName));
  }

  /**
   * Export model to CPLEX LP format string
   */
  toLpString(): string {
    this.validateIntegrity();
    const { lpString } = generateLpString({
      name: this.name,
      sense: this.sense,
      objective: this.objectiveExpr,
      constraints: this.constraints,
      variables: this.variables,
    });
    return lpString;
  }

  /**
   * Validates model integrity: variable bounds, ownership, numeric sanity, and unique constraint names.
   * Throws an Error with actionable explanation if any validation rule is violated.
   */
  validateIntegrity(): void {
    validateModelIntegrity(this);
  }

  /**
   * Solve the optimization model using the configured solver (defaults to HiGHS WASM)
   * or a solver passed dynamically (e.g., await model.solve(new HiGHS())).
   *
   * Calling solve() resets any prior solution and diagnostic values before executing.
   */
  async solve(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<SolverStatus> {
    this.resetSolutionState();
    this.validateIntegrity();

    let activeSolver: Solver;
    let activeOptions: SolveOptions;

    if (
      solverOrOptions &&
      typeof solverOrOptions === "object" &&
      "solve" in solverOrOptions &&
      typeof (solverOrOptions as any).solve === "function"
    ) {
      activeSolver = solverOrOptions as Solver;
      activeOptions = options || {};
    } else if (typeof solverOrOptions === "function") {
      activeSolver = new (solverOrOptions as any)(options);
      activeOptions = options || {};
    } else if (typeof solverOrOptions === "string") {
      activeSolver = getSolver(solverOrOptions, options);
      activeOptions = options || {};
    } else {
      activeOptions = { ...(solverOrOptions as SolveOptions) };
      if (activeOptions.solver) {
        activeSolver = getSolver(activeOptions.solver, activeOptions);
        delete activeOptions.solver;
      } else {
        activeSolver = this.solver || getSolver();
      }
    }

    // Capability check: Validate if solver supports quadratic objectives
    const hasQuadObjective =
      this.objectiveExpr instanceof QuadExpr && this.objectiveExpr.quadTerms.size > 0;
    if (hasQuadObjective && activeSolver.capabilities?.supportsQP === false) {
      throw new Error(
        `Solver "${activeSolver.name}" does not support quadratic objectives (QP). Please use a QP-capable solver such as HiGHS or Clarabel.`
      );
    }

    // Capability check: Validate if solver supports SMT / logical constraints
    if (this.logicalConstraints.length > 0 && activeSolver.capabilities?.supportsSMT !== true) {
      throw new Error(
        `Solver "${activeSolver.name}" does not support SMT / logical constraints (or, implies, not, xor). Please use an SMT-capable solver such as Z3.`
      );
    }

    const modelData = {
      name: this.name,
      sense: this.sense,
      objective: this.objectiveExpr,
      constraints: this.constraints,
      variables: this.variables,
      logicalConstraints: this.logicalConstraints,
      boolVars: this.boolVars,
    };

    const lpData: LpExportResult = generateLpString(modelData);

    const result: SolverResult = await activeSolver.solve(modelData, lpData, activeOptions);

    this.runTime = result.runTime ?? 0;
    this.status = result.status;
    this.terminationStatus = result.terminationStatus ?? result.status;

    const rawValues = result.values || {};
    const hasPrimal =
      typeof result.hasPrimalSolution === "boolean"
        ? result.hasPrimalSolution
        : this.status !== "Infeasible" &&
          this.status !== "Unsat" &&
          this.status !== "Unbounded" &&
          this.status !== "Error" &&
          this.status !== "NotSolved" &&
          this.terminationStatus !== "Infeasible" &&
          this.terminationStatus !== "Unsat" &&
          this.terminationStatus !== "Unbounded" &&
          this.terminationStatus !== "InfeasibleOrUnbounded" &&
          this.terminationStatus !== "Error" &&
          this.terminationStatus !== "NotSolved" &&
          (this.status === "Optimal" ||
            this.status === "Feasible" ||
            this.status === "Sat" ||
            this.terminationStatus === "Optimal" ||
            this.terminationStatus === "Feasible" ||
            this.terminationStatus === "Sat" ||
            (typeof result.objectiveValue === "number" && Number.isFinite(result.objectiveValue)) ||
            Object.values(rawValues).some((val) => typeof val === "number" && Number.isFinite(val)));

    this.hasPrimalSolution = hasPrimal;
    this.objectiveValue =
      hasPrimal && typeof result.objectiveValue === "number" && Number.isFinite(result.objectiveValue)
        ? result.objectiveValue
        : null;

    this.objectiveBound =
      typeof result.objectiveBound === "number" && Number.isFinite(result.objectiveBound)
        ? result.objectiveBound
        : undefined;
    const resolvedRelGap =
      typeof result.relGap === "number" && Number.isFinite(result.relGap)
        ? result.relGap
        : typeof result.mipGap === "number" && Number.isFinite(result.mipGap)
          ? result.mipGap
          : undefined;
    this.relGap = resolvedRelGap;
    this.mipGap = resolvedRelGap;
    this.absGap =
      typeof result.absGap === "number" && Number.isFinite(result.absGap)
        ? result.absGap
        : this.objectiveValue !== null && this.objectiveBound !== undefined
          ? Math.abs(this.objectiveValue - this.objectiveBound)
          : undefined;

    const valuesRecord: Record<string, number> = {};
    const dualsRecord: Record<string, number> = {};
    const reducedCostsRecord: Record<string, number> = {};
    const slacksRecord: Record<string, number> = {};

    this.values.clear();

    // Map variable solutions back to Var objects only when a feasible primal solution exists
    if (hasPrimal && result.values) {
      for (const [vName, primal] of Object.entries(result.values)) {
        if (typeof primal === "number" && !Number.isNaN(primal)) {
          this.values.set(vName, primal);
          const v = this.getVarByName(vName) || lpData.nameToVar.get(vName);
          if (v) {
            v.value = primal;
            valuesRecord[v.name] = primal;
          }
          const bv = this.boolVars.find((b) => b.name === vName);
          if (bv) {
            bv.value = Boolean(primal);
          }
        }
      }
    }

    if (result.reducedCosts) {
      for (const [vName, rc] of Object.entries(result.reducedCosts)) {
        const v = this.getVarByName(vName) || lpData.nameToVar.get(vName);
        if (v) {
          v.reducedCost = rc;
          reducedCostsRecord[v.name] = rc;
        }
      }
    }

    // Map row duals and slacks back to Constraint objects
    if (result.duals) {
      for (const [cName, dual] of Object.entries(result.duals)) {
        const c = this.getConstraintByName(cName) || lpData.nameToConstraint.get(cName);
        if (c) {
          c.dual = dual;
          dualsRecord[c.name] = dual;
        }
      }
    }

    if (result.slacks) {
      for (const [cName, slack] of Object.entries(result.slacks)) {
        const c = this.getConstraintByName(cName) || lpData.nameToConstraint.get(cName);
        if (c) {
          c.slack = slack;
          slacksRecord[c.name] = slack;
        }
      }
    }

    this.solution = {
      status: this.status,
      terminationStatus: this.terminationStatus,
      hasPrimalSolution: this.hasPrimalSolution,
      objectiveValue: this.objectiveValue,
      ...(this.objectiveBound !== undefined ? { objectiveBound: this.objectiveBound } : {}),
      ...(this.relGap !== undefined ? { relGap: this.relGap, mipGap: this.mipGap } : {}),
      ...(this.absGap !== undefined ? { absGap: this.absGap } : {}),
      values: valuesRecord,
      duals: dualsRecord,
      reducedCosts: reducedCostsRecord,
      slacks: slacksRecord,
      runTime: this.runTime,
      raw: result.raw,
    };
    this.hasSolutionState = true;

    return this.status;
  }

  /**
   * Fully identical pass-through alias to solve().
   * Matches parameters, return value, and side effects.
   */
  async optimize(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<SolverStatus> {
    return this.solve(solverOrOptions, options);
  }

  /**
   * Check satisfiability of the model without requiring an objective function.
   * Can be used to verify feasibility or diagnose infeasibilities / conflicts.
   */
  async check(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<CheckResult> {
    this.resetSolutionState();
    this.validateIntegrity();

    let activeSolver: Solver;
    let activeOptions: SolveOptions;

    if (
      solverOrOptions &&
      typeof solverOrOptions === "object" &&
      "solve" in solverOrOptions &&
      typeof (solverOrOptions as any).solve === "function"
    ) {
      activeSolver = solverOrOptions as Solver;
      activeOptions = options || {};
    } else if (typeof solverOrOptions === "function") {
      activeSolver = new (solverOrOptions as any)(options);
      activeOptions = options || {};
    } else if (typeof solverOrOptions === "string") {
      activeSolver = getSolver(solverOrOptions, options);
      activeOptions = options || {};
    } else {
      activeOptions = { ...(solverOrOptions as SolveOptions) };
      if (activeOptions.solver) {
        activeSolver = getSolver(activeOptions.solver, activeOptions);
        delete activeOptions.solver;
      } else {
        activeSolver = this.solver || getSolver();
      }
    }

    // 1. Guard against logical constraints if solver lacks SMT
    if (this.logicalConstraints.length > 0 && activeSolver.capabilities?.supportsSMT !== true) {
      throw new Error(
        `Solver "${activeSolver.name}" does not support SMT / logical constraints (or, implies, not, xor). Please use an SMT-capable solver such as Z3.`
      );
    }

    // 2. If solver implements native check() (e.g. Z3)
    if (typeof activeSolver.check === "function") {
      const checkResult = await activeSolver.check(
        {
          name: this.name,
          variables: this.variables,
          boolVars: this.boolVars,
          constraints: this.constraints,
          logicalConstraints: this.logicalConstraints,
        },
        activeOptions
      );
      this.status = checkResult.status;
      this.terminationStatus = checkResult.status;
      this.hasPrimalSolution = checkResult.status === "Sat";
      this.runTime = checkResult.runTime ?? 0;
      this.unsatCore = checkResult.unsatCore !== undefined ? Object.freeze([...checkResult.unsatCore]) : undefined;

      if (checkResult.values && checkResult.status === "Sat") {
        for (const [name, val] of Object.entries(checkResult.values)) {
          this.values.set(name, val);
          const v = this.getVarByName(name);
          if (v && typeof val === "number") {
            v.value = val;
          }
          const bv = this.boolVars.find((b) => b.name === name);
          if (bv) {
            bv.value = Boolean(val);
          }
        }
      }
      this.hasSolutionState = true;
      return {
        status: checkResult.status,
        values: Object.fromEntries(this.values),
        unsatCore: this.unsatCore,
        conflicts: this.unsatCore,
        runTime: this.runTime,
      };
    }

    // 3. Fallback: Linear Feasibility check using standard solve() with 0 objective
    const originalObjective = this.objectiveExpr;
    const originalSense = this.sense;
    try {
      this.objectiveExpr = new LinExpr();
      this.sense = "Minimize";
      const status = await this.solve(activeSolver, activeOptions);
      const isSat = this.hasPrimalSolution || status === "Optimal" || status === "Feasible";
      const isUnsat = status === "Infeasible";
      const checkStatus = isSat ? "Sat" : isUnsat ? "Unsat" : "Unknown";

      this.status = checkStatus;
      this.terminationStatus =
        isSat || isUnsat || this.terminationStatus === "Optimal" || this.terminationStatus === "Feasible" || this.terminationStatus === "Infeasible"
          ? checkStatus
          : this.terminationStatus;
      this.hasPrimalSolution = isSat;
      this.objectiveValue = null;
      this.objectiveBound = undefined;
      this.relGap = undefined;
      this.mipGap = undefined;
      this.absGap = undefined;
      this.solution = null;

      for (const v of this.variables) {
        v.reducedCost = null;
      }
      for (const c of this.constraints) {
        c.dual = null;
      }

      const values: Record<string, number | boolean> = {};
      if (isSat) {
        for (const v of this.variables) {
          if (v.value !== null) {
            values[v.name] = v.value;
          }
        }
        for (const bv of this.boolVars) {
          if (bv.value !== null) {
            values[bv.name] = bv.value;
          }
        }
      }

      return {
        status: checkStatus,
        values,
        runTime: this.runTime,
      };
    } finally {
      this.objectiveExpr = originalObjective;
      this.sense = originalSense;
    }
  }
}
