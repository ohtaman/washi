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
import { BoolVar, BoolExpr } from "./boolean-expr.js";
import { parseExpr, parseConstraint } from "./parser.js";
import { generateLpString, type LpExportResult } from "./lp-writer.js";
import { getSolver, type Solver, type SolverOptions, type SolverResult } from "./solvers/index.js";
import {
  validateModelSolution,
  type SolutionValidationOptions,
  type SolutionValidationReport,
} from "./solution-validator.js";

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
  initialValue?: number;
  [Symbol.iterator]?: never;
}

export interface BinaryOptions {
  name?: string;
  prefix?: string;
  initialValue?: number;
  [Symbol.iterator]?: never;
}

type VarNameOptions = {
  prefix?: string;
  name?: string;
  [Symbol.iterator]?: never;
};

import {
  type IndicatorOptions,
  deriveBigMForLe,
  deriveBigMForGe,
  validateUserBigM,
  buildIndicatorLinearization,
} from "./big-m.js";
import {
  attachLogicElementOwnership,
  claimConstraintOwnership,
  claimVarOwnership,
  releaseConstraintOwnership,
  releaseVarOwnership,
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

function isKeyCollection(val: unknown): val is Iterable<string | number> {
  return (
    Array.isArray(val) ||
    (typeof val === "object" &&
      val !== null &&
      !(val instanceof String) &&
      typeof (val as any)[Symbol.iterator] === "function")
  );
}

function isPlainOptionsObject(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    !Array.isArray(val) &&
    !(val instanceof String) &&
    typeof (val as any)[Symbol.iterator] !== "function"
  );
}

declare const UniqueStringTag: unique symbol;
declare global {
  interface String {
    readonly [UniqueStringTag]: false;
  }
}

export type KeyCollection<K extends string | number> =
  | ReadonlyArray<K>
  | (Iterable<K> & object & { readonly [UniqueStringTag]?: true });

function assertValidCount(count: number, label: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(
      `Invalid count (${count}) for ${label} variable creation: count must be a non-negative integer.`
    );
  }
}

export class Model {
  public name: string;
  private _sense: OptimizationSense;
  private _objectiveExpr: LinExpr | QuadExpr;
  public variables: Var[] = [];
  public constraints: Constraint[] = [];
  public boolVars: BoolVar[] = [];
  public logicalConstraints: LogicalConstraint[] = [];
  public unsatCore: readonly string[] | undefined = undefined;
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
  private modelRevision: number = 0;
  private activeOperationId: number = 0;
  private batchDepth: number = 0;
  private batchMutated: boolean = false;
  private batchUndoActions: Array<() => void> = [];

  constructor(nameOrOptions: string | ModelOptions = {}, maybeOptions?: ModelOptions) {
    let options: ModelOptions;
    if (typeof nameOrOptions === "string") {
      options = { ...maybeOptions, name: nameOrOptions };
    } else {
      options = nameOrOptions;
    }
    this.name = options.name || "OptimizationModel";
    this._sense = normalizeSense(options.sense);
    this._objectiveExpr = new LinExpr();
    if (options.solver) {
      this.solver = getSolver(options.solver);
    }
  }

  get sense(): OptimizationSense {
    return this._sense;
  }

  set sense(value: OptimizationSense) {
    const normalized = normalizeSense(value);
    if (this._sense !== normalized) {
      this._sense = normalized;
      this.recordModelMutation();
    }
  }

  get objectiveExpr(): LinExpr | QuadExpr {
    return this._objectiveExpr.clone();
  }

  set objectiveExpr(value: LinExpr | QuadExpr | Constraint) {
    this.applyObjective(value);
  }

  /**
   * User-friendly alias for unsatCore.
   * Returns a subset of conflicting constraint names causing infeasibility,
   * or undefined if not diagnosed, not applicable, or satisfiable.
   */
  get conflicts(): readonly string[] | undefined {
    return this.unsatCore;
  }

  get numVars(): number {
    return this.variables.length;
  }

  get numConstrs(): number {
    return this.constraints.length;
  }

  /**
   * Clears stored solution and diagnostic fields on the model and its entities.
   */
  private clearSolutionFields(): void {
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
    this.hasSolutionState = false;
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
  }

  /**
   * Records a model mutation, invalidating any stored solution state and in-flight solver executions.
   */
  private recordModelMutation(): void {
    if (this.batchDepth > 0) {
      this.batchMutated = true;
      return;
    }
    this.modelRevision++;
    this.clearSolutionFields();
  }

  /**
   * @internal Notifies the model that an owned entity (e.g., Var bounds/type or Constraint RHS/sense) was mutated.
   */
  public notifyMutation(): void {
    this.recordModelMutation();
  }

  /**
   * Reset prior solution and diagnostic state to avoid stale data leakage across runs,
   * and invalidate any in-flight solve() or check() execution.
   */
  public resetSolutionState(): void {
    this.recordModelMutation();
  }

  /**
   * Executes a multi-item model mutation atomically so failed batch edits neither leave
   * partial entities registered nor invalidate prior solved / in-flight state.
   */
  private runTransactionalBatch<T>(fn: () => T): T {
    if (this.batchDepth > 0) {
      return fn();
    }
    const varsLen = this.variables.length;
    const boolVarsLen = this.boolVars.length;
    const constrsLen = this.constraints.length;
    const logicalConstrsLen = this.logicalConstraints.length;
    const savedVarCounters = new Map(this.varPrefixCounters);
    const savedBoolVarCounters = new Map(this.boolVarPrefixCounters);
    const savedConstrCounters = new Map(this.constrPrefixCounters);
    const savedLogicalCounter = this.logicalConstrCounter;

    this.batchDepth = 1;
    this.batchMutated = false;
    this.batchUndoActions = [];

    try {
      const result = fn();
      this.batchDepth = 0;
      const mutated = this.batchMutated;
      this.batchMutated = false;
      this.batchUndoActions = [];
      if (mutated) {
        this.recordModelMutation();
      }
      return result;
    } catch (err) {
      this.batchDepth = 0;
      this.batchMutated = false;

      for (let i = varsLen; i < this.variables.length; i++) {
        const v = this.variables[i];
        this.varMapByName.delete(v.name);
        v.ownerModel = null;
        releaseVarOwnership(v, this);
      }
      this.variables.length = varsLen;

      for (let i = boolVarsLen; i < this.boolVars.length; i++) {
        const bv = this.boolVars[i];
        this.boolVarMapByName.delete(bv.name);
      }
      this.boolVars.length = boolVarsLen;

      for (let i = constrsLen; i < this.constraints.length; i++) {
        const c = this.constraints[i];
        this.constrMapByName.delete(c.name);
      }
      this.constraints.length = constrsLen;

      for (let i = logicalConstrsLen; i < this.logicalConstraints.length; i++) {
        const lc = this.logicalConstraints[i];
        this.logicalConstrMapByName.delete(lc.name);
      }
      this.logicalConstraints.length = logicalConstrsLen;

      for (let i = this.batchUndoActions.length - 1; i >= 0; i--) {
        this.batchUndoActions[i]();
      }
      this.batchUndoActions = [];

      this.varPrefixCounters = savedVarCounters;
      this.boolVarPrefixCounters = savedBoolVarCounters;
      this.constrPrefixCounters = savedConstrCounters;
      this.logicalConstrCounter = savedLogicalCounter;

      throw err;
    }
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
    const label = domainType.toLowerCase();
    // 2D case: arg2 is number or array/iterable
    const isDim1Count = typeof arg1 === "number";
    const isDim2Count = typeof arg2 === "number";
    const isDim1Iterable = isKeyCollection(arg1);
    const isDim2Iterable = isKeyCollection(arg2);

    if (isDim2Count || isDim2Iterable) {
      if (isDim1Count) assertValidCount(arg1, label);
      if (isDim2Count) assertValidCount(arg2, label);
      if (!isDim1Count && !isDim1Iterable) {
        throw new Error(`Invalid arguments provided for ${label} variable creation`);
      }
      if (arg3 !== undefined && !isPlainOptionsObject(arg3)) {
        throw new Error(`Invalid arguments provided for ${label} variable creation`);
      }
      const rows = isDim1Count ? Array.from({ length: arg1 }, (_, i) => i) : Array.from(arg1);
      const cols = isDim2Count
        ? Array.from({ length: arg2 }, (_, i) => i)
        : arg2 === arg1
          ? rows
          : Array.from(arg2);
      const opts = arg3 || {};
      const prefix = opts.prefix || opts.name || "x";
      return this.runTransactionalBatch(() => {
        const matrix: any = isDim1Count ? [] : {};
        for (const r of rows) {
          const rowContainer: any = isDim2Count ? [] : {};
          for (const c of cols) {
            rowContainer[c as any] = this.addVar({
              ...opts,
              type: domainType,
              name: `${prefix}_${r}_${c}`,
            });
          }
          matrix[r as any] = rowContainer;
        }
        return matrix;
      });
    }

    // 1D single variable: arg1 is string, undefined, or options object
    if (typeof arg1 === "string" || arg1 === undefined) {
      if (arg2 !== undefined && !isPlainOptionsObject(arg2)) {
        throw new Error(`Invalid arguments provided for ${label} variable creation`);
      }
      const opts = (arg2 as BoundsOptions) || {};
      const explicitName = typeof arg1 === "string" ? arg1 : opts.name;
      return this.addVar({
        ...opts,
        type: domainType,
        name: explicitName,
      });
    }
    if (isPlainOptionsObject(arg1)) {
      if (arg2 !== undefined) {
        throw new Error(`Invalid arguments provided for ${label} variable creation`);
      }
      const opts = arg1 as BoundsOptions;
      return this.addVar({
        ...opts,
        type: domainType,
      });
    }

    // 1D multiple variables: count (number) or keys (array/iterable)
    if (arg2 !== undefined && !isPlainOptionsObject(arg2)) {
      throw new Error(`Invalid arguments provided for ${label} variable creation`);
    }
    const opts = (arg2 as BoundsOptions) || {};
    const prefix = opts.prefix || opts.name;
    if (typeof arg1 === "number") {
      assertValidCount(arg1, label);
      return this.runTransactionalBatch(() => {
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
      });
    } else if (isKeyCollection(arg1)) {
      return this.runTransactionalBatch(() => {
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
      });
    }

    throw new Error(`Invalid arguments provided for ${label} variable creation`);
  }

  /**
   * Create 0-1 binary variable(s) (x in {0, 1}).
   * Supports:
   * - m.binary("x") -> Var
   * - m.binary() -> Var
   * - m.binary(5) -> Var[]
   * - m.binary(["a", "b"]) -> Record<string, Var>
   * - m.binary(rowsCount, colsCount) -> Var[][]
   * - m.binary(rowsCount, colKeys) -> Record<C, Var>[]
   * - m.binary(rowKeys, colsCount) -> Record<R, Var[]>
   * - m.binary(rowKeys, colKeys) -> Record<R, Record<C, Var>>
   */
  binary(name?: string, options?: BinaryOptions): Var;
  binary(options: BinaryOptions): Var;
  binary(count: number, options?: BinaryOptions): Var[];
  binary<K extends string | number>(
    keys: KeyCollection<K>,
    options?: BinaryOptions
  ): Record<K, Var>;
  binary(
    rows: number,
    cols: number,
    options?: BinaryOptions
  ): Var[][];
  binary<C extends string | number>(
    rows: number,
    cols: KeyCollection<C>,
    options?: BinaryOptions
  ): Array<Record<C, Var>>;
  binary<R extends string | number>(
    rows: KeyCollection<R>,
    cols: number,
    options?: BinaryOptions
  ): Record<R, Var[]>;
  binary<R extends string | number, C extends string | number>(
    rows: KeyCollection<R>,
    cols: KeyCollection<C>,
    options?: BinaryOptions
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
   * - m.integer(rowsCount, colsCount, options) -> Var[][]
   * - m.integer(rowsCount, colKeys, options) -> Record<C, Var>[]
   * - m.integer(rowKeys, colsCount, options) -> Record<R, Var[]>
   * - m.integer(rowKeys, colKeys, options) -> Record<R, Record<C, Var>>
   */
  integer(name?: string, options?: BoundsOptions): Var;
  integer(options: BoundsOptions): Var;
  integer(count: number, options?: BoundsOptions): Var[];
  integer<K extends string | number>(
    keys: KeyCollection<K>,
    options?: BoundsOptions
  ): Record<K, Var>;
  integer(
    rows: number,
    cols: number,
    options?: BoundsOptions
  ): Var[][];
  integer<C extends string | number>(
    rows: number,
    cols: KeyCollection<C>,
    options?: BoundsOptions
  ): Array<Record<C, Var>>;
  integer<R extends string | number>(
    rows: KeyCollection<R>,
    cols: number,
    options?: BoundsOptions
  ): Record<R, Var[]>;
  integer<R extends string | number, C extends string | number>(
    rows: KeyCollection<R>,
    cols: KeyCollection<C>,
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
   * - m.continuous(rowsCount, colsCount, options) -> Var[][]
   * - m.continuous(rowsCount, colKeys, options) -> Record<C, Var>[]
   * - m.continuous(rowKeys, colsCount, options) -> Record<R, Var[]>
   * - m.continuous(rowKeys, colKeys, options) -> Record<R, Record<C, Var>>
   */
  continuous(name?: string, options?: BoundsOptions): Var;
  continuous(options: BoundsOptions): Var;
  continuous(count: number, options?: BoundsOptions): Var[];
  continuous<K extends string | number>(
    keys: KeyCollection<K>,
    options?: BoundsOptions
  ): Record<K, Var>;
  continuous(
    rows: number,
    cols: number,
    options?: BoundsOptions
  ): Var[][];
  continuous<C extends string | number>(
    rows: number,
    cols: KeyCollection<C>,
    options?: BoundsOptions
  ): Array<Record<C, Var>>;
  continuous<R extends string | number>(
    rows: KeyCollection<R>,
    cols: number,
    options?: BoundsOptions
  ): Record<R, Var[]>;
  continuous<R extends string | number, C extends string | number>(
    rows: KeyCollection<R>,
    cols: KeyCollection<C>,
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
   * - m.bool(rowsCount, colsCount) -> BoolVar[][]
   * - m.bool(rowsCount, colKeys) -> Record<C, BoolVar>[]
   * - m.bool(rowKeys, colsCount) -> Record<R, BoolVar[]>
   * - m.bool(rowKeys, colKeys) -> Record<R, Record<C, BoolVar>>
   */
  bool(name?: string, options?: VarNameOptions): BoolVar;
  bool(options: VarNameOptions): BoolVar;
  bool(count: number, options?: VarNameOptions): BoolVar[];
  bool<K extends string | number>(
    keys: KeyCollection<K>,
    options?: VarNameOptions
  ): Record<K, BoolVar>;
  bool(
    rows: number,
    cols: number,
    options?: VarNameOptions
  ): BoolVar[][];
  bool<C extends string | number>(
    rows: number,
    cols: KeyCollection<C>,
    options?: VarNameOptions
  ): Array<Record<C, BoolVar>>;
  bool<R extends string | number>(
    rows: KeyCollection<R>,
    cols: number,
    options?: VarNameOptions
  ): Record<R, BoolVar[]>;
  bool<R extends string | number, C extends string | number>(
    rows: KeyCollection<R>,
    cols: KeyCollection<C>,
    options?: VarNameOptions
  ): Record<R, Record<C, BoolVar>>;
  bool(arg1?: any, arg2?: any, arg3?: any): any {
    // 2D case: arg2 is number or array/iterable
    const isDim1Count = typeof arg1 === "number";
    const isDim2Count = typeof arg2 === "number";
    const isDim1Iterable = isKeyCollection(arg1);
    const isDim2Iterable = isKeyCollection(arg2);

    if (isDim2Count || isDim2Iterable) {
      if (isDim1Count) assertValidCount(arg1, "boolean");
      if (isDim2Count) assertValidCount(arg2, "boolean");
      if (!isDim1Count && !isDim1Iterable) {
        throw new Error("Invalid arguments provided for boolean variable creation");
      }
      if (arg3 !== undefined && !isPlainOptionsObject(arg3)) {
        throw new Error("Invalid arguments provided for boolean variable creation");
      }
      const rows = isDim1Count ? Array.from({ length: arg1 }, (_, i) => i) : Array.from(arg1);
      const cols = isDim2Count
        ? Array.from({ length: arg2 }, (_, i) => i)
        : arg2 === arg1
          ? rows
          : Array.from(arg2);
      const opts = arg3 || {};
      const prefix = opts.prefix || opts.name || "p";
      return this.runTransactionalBatch(() => {
        const matrix: any = isDim1Count ? [] : {};
        for (const r of rows) {
          const rowContainer: any = isDim2Count ? [] : {};
          for (const c of cols) {
            rowContainer[c as any] = this.createBoolVar(`${prefix}_${r}_${c}`);
          }
          matrix[r as any] = rowContainer;
        }
        return matrix;
      });
    }

    // 1D single variable or options object
    if (typeof arg1 === "string" || arg1 === undefined) {
      if (arg2 !== undefined && !isPlainOptionsObject(arg2)) {
        throw new Error("Invalid arguments provided for boolean variable creation");
      }
      const opts = (arg2 as { prefix?: string; name?: string }) || {};
      const explicitName = typeof arg1 === "string" ? arg1 : opts.name;
      return this.createBoolVar(explicitName, opts.prefix);
    }
    if (isPlainOptionsObject(arg1)) {
      if (arg2 !== undefined) {
        throw new Error("Invalid arguments provided for boolean variable creation");
      }
      const opts = arg1 as { prefix?: string; name?: string };
      return this.createBoolVar(opts.name, opts.prefix);
    }

    // 1D multiple variables: count (number) or keys (array/iterable)
    if (arg2 !== undefined && !isPlainOptionsObject(arg2)) {
      throw new Error("Invalid arguments provided for boolean variable creation");
    }
    const opts = (arg2 as { prefix?: string; name?: string }) || {};
    const prefix = opts.prefix || opts.name;
    if (typeof arg1 === "number") {
      assertValidCount(arg1, "boolean");
      return this.runTransactionalBatch(() => {
        const result: BoolVar[] = [];
        const p = prefix || "p";
        for (let i = 0; i < arg1; i++) {
          result.push(this.createBoolVar(undefined, p));
        }
        return result;
      });
    } else if (isKeyCollection(arg1)) {
      return this.runTransactionalBatch(() => {
        const result: Record<string, BoolVar> = {};
        for (const key of arg1) {
          const varName = prefix ? `${prefix}_${key}` : `${key}`;
          result[key] = this.createBoolVar(varName);
        }
        return result;
      });
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
    this.recordModelMutation();
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
      this.recordModelMutation();
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
    this.applyObjective(spec.expr, spec.sense);
    return this;
  }

  /**
   * Internal objective setter.
   */
  private applyObjective(expr: LinExpr | QuadExpr | Var | number | string | Constraint, sense?: OptimizationSense): void {
    if (
      expr instanceof Constraint ||
      (typeof expr === "object" &&
        expr !== null &&
        "sense" in expr &&
        "lhs" in expr &&
        "rhs" in expr) ||
      (typeof expr === "string" && /(<=|>=|==|=<|=>|=)/.test(expr))
    ) {
      throw new Error(
        typeof expr === "string"
          ? "Cannot use a comparison constraint as an objective. Did you mean to use m.constraint(expr`... <= ...`)?"
          : "Cannot use a Constraint as an objective. Did you mean to use m.constraint(expr`... <= ...`)? For objectives, supply an unconstrained expression like expr`45 * ${x} + 80 * ${y}`."
      );
    }

    const newSense = sense !== undefined ? normalizeSense(sense) : this.sense;

    let parsedExpr: LinExpr | QuadExpr;
    if (typeof expr === "string") {
      parsedExpr = parseExpr(expr, (name) => this.getVarByName(name));
    } else if (typeof expr === "number") {
      parsedExpr = new LinExpr(new Map(), expr);
    } else if (expr instanceof QuadExpr) {
      parsedExpr = expr.clone();
    } else if (expr instanceof LinExpr) {
      parsedExpr = expr.clone();
    } else if (
      typeof expr === "object" &&
      expr !== null &&
      "quadTerms" in expr &&
      (expr as { quadTerms: unknown }).quadTerms instanceof Map &&
      "linearTerms" in expr &&
      (expr as { linearTerms: unknown }).linearTerms instanceof Map &&
      typeof (expr as { constant?: unknown }).constant === "number"
    ) {
      const q = expr as unknown as QuadExpr;
      parsedExpr = new QuadExpr(q.linearTerms, q.quadTerms, q.constant);
    } else if (
      typeof expr === "object" &&
      expr !== null &&
      "terms" in expr &&
      (expr as { terms: unknown }).terms instanceof Map &&
      typeof (expr as { constant?: unknown }).constant === "number"
    ) {
      const l = expr as unknown as LinExpr;
      parsedExpr = new LinExpr(l.terms, l.constant);
    } else if (
      expr instanceof Var ||
      (typeof expr === "object" &&
        expr !== null &&
        "id" in expr &&
        "name" in expr &&
        "lb" in expr &&
        "ub" in expr)
    ) {
      parsedExpr = new LinExpr(new Map([[expr as Var, 1]]), 0);
    } else {
      throw new Error(
        "Invalid objective expression: expected a finite number, Var, LinExpr, QuadExpr, or arithmetic expression string."
      );
    }

    // Validate objective numeric inputs and model ownership
    validateObjectiveExpr(parsedExpr, this.name, (v) => this.varMapByName.get(v.name) === v);

    this._sense = newSense;
    this._objectiveExpr = parsedExpr;
    this.recordModelMutation();
  }

  /**
   * Add linear, boolean, or string formula constraint(s) to the model.
   * Rejects raw arithmetic expressions (e.g. LinExpr, QuadExpr) without comparison operators.
   * Chainable: returns this.
   *
   * @example
   * m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood")
   * m.constraint(items.map(i => expr`${x[i]} <= 10`))
   * m.constraint(c1).constraint(c2)
   */
  constraint(constraint: ConstraintItem | LinExpr | QuadExpr, name?: string): this;
  constraint(constraints: ReadonlyArray<ConstraintItem | LinExpr | QuadExpr>): this;
  constraint(
    item: ConstraintItem | LinExpr | QuadExpr | ReadonlyArray<ConstraintItem | LinExpr | QuadExpr>,
    name?: string
  ): this {
    if (Array.isArray(item)) {
      return this.runTransactionalBatch(() => {
        for (const elem of item) {
          this.constraint(elem);
        }
        return this;
      });
    }
    if (
      item instanceof QuadExpr ||
      (typeof item === "object" && item !== null && "quadTerms" in item)
    ) {
      throw new Error(
        "Constraint must contain a comparison operator (<=, >=, ==): cannot add a quadratic expression as a constraint."
      );
    }
    if (
      item instanceof LinExpr ||
      (typeof item === "object" && item !== null && "terms" in item)
    ) {
      throw new Error(
        "Constraint must contain a comparison operator (<=, >=, ==): cannot add a linear expression without a comparison operator. Use expr`... <= ...` or .le(), .ge(), .eq()."
      );
    }
    this.addConstraint(item as Constraint | BoolExpr | string, name);
    return this;
  }

  /**
   * Extract primal solution values directly into plain primitives, preserving container shapes:
   * - m.getValues(x) -> number | null
   * - m.getValues(p) -> boolean | null
   * - m.getValues([x, y]) -> (number | null)[]
   * - m.getValues([[x11, x12], [x21, x22]]) -> (number | null)[][]
   * - m.getValues(record) -> Record<K, number | boolean | null>
   * - m.getValues(matrix) -> Record<R, Record<C, number | boolean | null>>
   */
  getValues(item: Var): number | null;
  getValues(item: BoolVar): boolean | null;
  getValues(items: ReadonlyArray<Var>): (number | null)[];
  getValues(items: ReadonlyArray<BoolVar>): (boolean | null)[];
  getValues(items: ReadonlyArray<ReadonlyArray<Var>>): (number | null)[][];
  getValues(items: ReadonlyArray<ReadonlyArray<BoolVar>>): (boolean | null)[][];
  getValues<C extends string | number>(
    items: ReadonlyArray<Record<C, Var>>
  ): Array<Record<C, number | null>>;
  getValues<C extends string | number>(
    items: ReadonlyArray<Record<C, BoolVar>>
  ): Array<Record<C, boolean | null>>;
  getValues<R extends string | number>(
    items: Record<R, ReadonlyArray<Var>>
  ): Record<R, (number | null)[]>;
  getValues<R extends string | number>(
    items: Record<R, ReadonlyArray<BoolVar>>
  ): Record<R, (boolean | null)[]>;
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
    if (
      constraint instanceof QuadExpr ||
      (typeof constraint === "object" && constraint !== null && "quadTerms" in constraint)
    ) {
      throw new Error(
        "Constraint must contain a comparison operator (<=, >=, ==): cannot add a quadratic expression as a constraint."
      );
    }
    if (
      constraint instanceof LinExpr ||
      (typeof constraint === "object" && constraint !== null && "terms" in constraint)
    ) {
      throw new Error(
        "Constraint must contain a comparison operator (<=, >=, ==): cannot add a linear expression without a comparison operator. Use expr`... <= ...` or .le(), .ge(), .eq()."
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
          (bv) => this.boolVarMapByName.get(bv.name) === bv,
          this
        );
      } catch (err) {
        if (explicitName === undefined) {
          this.logicalConstrCounter = savedLogicalCounter;
        }
        throw err;
      }

      attachLogicElementOwnership(
        constraint,
        this,
        this.batchDepth > 0 ? this.batchUndoActions : undefined
      );
      const lcEntry: LogicalConstraint = {
        name: constrName,
        expr: constraint,
      };
      this.logicalConstraints.push(lcEntry);
      this.logicalConstrMapByName.set(constrName, lcEntry);
      this.recordModelMutation();
      return constraint;
    }

    const constr =
      typeof constraint === "string"
        ? parseConstraint(constraint, (varName) => this.getVarByName(varName), name)
        : constraint;

    if (constr.ownerModel && constr.ownerModel !== this) {
      validateLinearConstraint(constr, this.name, (v) => this.varMapByName.get(v.name) === v, constr.name);
      claimConstraintOwnership(constr, this);
    }

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
    let prevOwnerModel: Model | undefined;
    try {
      validateLinearConstraint(constr, this.name, (v) => this.varMapByName.get(v.name) === v, resolvedName);
      prevOwnerModel = claimConstraintOwnership(constr, this);
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

    const prevName = constr.name;
    const prevExplicit = constr.hasExplicitName;
    const prevOwner = constr.ownerModel;
    const savedPrevOwnerModel = prevOwnerModel;
    this.batchUndoActions.push(() => {
      constr.ownerModel = prevOwner;
      constr._assignModelName(prevName, prevExplicit);
      releaseConstraintOwnership(constr, this, savedPrevOwnerModel);
    });
    if (this.batchDepth === 0) {
      this.batchUndoActions = [];
    }
    constr._assignModelName(resolvedName, true);
    constr.ownerModel = this;
    this.constraints.push(constr);
    this.constrMapByName.set(constr.name, constr);
    this.recordModelMutation();
    return constr;
  }

  /**
   * Add an indicator constraint via floating-point Big-M auto-linearization:
   * "If binVar == activeValue, then constraint holds"
   *
   * Automatically handles <=, >=, and == constraints for LP/MIP solvers (HiGHS, GLPK)
   * under standard floating-point feasibility tolerances.
   * Note: Because Big-M rows are floating-point linear relaxations, they do not
   * guarantee exact rational equivalence in SMT solvers (Z3); use logical
   * implications (`implies()`) when exact SMT diagnosis is required.
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
      (binVar.type === "Integer" && binVar.lb === 0 && binVar.ub === 1);
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

    return this.runTransactionalBatch(() =>
      pending.map(([cRow, rowName]) => this.addConstraint(cRow, rowName))
    );
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

  private ensureExecutionValid(
    startRevision: number,
    opId: number,
    opName: "solve" | "check"
  ): void {
    if (this.modelRevision !== startRevision) {
      if (this.activeOperationId === opId) {
        this.clearSolutionFields();
      }
      throw new Error(
        `Model "${this.name}" was modified while ${opName}() was in progress; stale solver result was discarded.`
      );
    }
    if (this.activeOperationId !== opId) {
      throw new Error(
        `Stale ${opName}() result discarded because a newer solve or check operation was started on model "${this.name}".`
      );
    }
  }

  private wrapSolveOptions(
    activeOptions: SolveOptions,
    startRevision: number,
    opId: number
  ): SolveOptions {
    const userOnProgress = activeOptions.onProgress;
    if (!userOnProgress) {
      return activeOptions;
    }
    return {
      ...activeOptions,
      onProgress: (event) => {
        if (this.activeOperationId !== opId || this.modelRevision !== startRevision) {
          return;
        }
        userOnProgress(event);
      },
    };
  }

  private hasPrimalFromResult(result: SolverResult): boolean {
    if (typeof result.hasPrimalSolution === "boolean") {
      return result.hasPrimalSolution;
    }
    const status = result.status;
    const termStatus = result.terminationStatus ?? status;
    const rawValues = result.values || {};
    return (
      status !== "Infeasible" &&
      status !== "Unsat" &&
      status !== "Unbounded" &&
      status !== "Error" &&
      status !== "NotSolved" &&
      termStatus !== "Infeasible" &&
      termStatus !== "Unsat" &&
      termStatus !== "Unbounded" &&
      termStatus !== "InfeasibleOrUnbounded" &&
      termStatus !== "Error" &&
      termStatus !== "NotSolved" &&
      (status === "Optimal" ||
        status === "Feasible" ||
        status === "Sat" ||
        termStatus === "Optimal" ||
        termStatus === "Feasible" ||
        termStatus === "Sat" ||
        (typeof result.objectiveValue === "number" && Number.isFinite(result.objectiveValue)) ||
        Object.values(rawValues).some((val) => typeof val === "number" && Number.isFinite(val)))
    );
  }

  /**
   * Solve the optimization model using the configured solver (defaults to HiGHS WASM)
   * or a solver passed dynamically (e.g., await model.solve(new HiGHS())).
   *
   * Calling solve() resets any prior solution and diagnostic values before executing.
   * If the model is modified or a newer solve()/check() call is started before this
   * execution completes, the stale result is discarded and the returned promise rejects.
   */
  async solve(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<SolverStatus> {
    const opId = ++this.activeOperationId;
    const startRevision = this.modelRevision;
    this.clearSolutionFields();
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
      this._objectiveExpr instanceof QuadExpr && this._objectiveExpr.quadTerms.size > 0;
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

    // Capability check: Validate if solver supports primal initial values (warm starts)
    if (
      this.variables.some((v) => v.initialValue !== undefined) &&
      activeSolver.capabilities?.supportsWarmStart !== true
    ) {
      throw new Error(
        `Solver "${activeSolver.name}" does not support primal initial values (initialValue). Please use a solver with warm-start support such as HiGHS.`
      );
    }

    const modelData = {
      name: this.name,
      sense: this.sense,
      objective: this._objectiveExpr,
      constraints: this.constraints,
      variables: this.variables,
      logicalConstraints: this.logicalConstraints,
      boolVars: this.boolVars,
    };

    const lpData: LpExportResult = generateLpString(modelData);
    const effectiveOptions = this.wrapSolveOptions(activeOptions, startRevision, opId);

    let result: SolverResult;
    try {
      result = await activeSolver.solve(modelData, lpData, effectiveOptions);
    } catch (err) {
      if (this.activeOperationId === opId) {
        this.clearSolutionFields();
      }
      throw err;
    }

    this.ensureExecutionValid(startRevision, opId, "solve");

    this.runTime = result.runTime ?? 0;
    this.status = result.status;
    this.terminationStatus = result.terminationStatus ?? result.status;

    const hasPrimal = this.hasPrimalFromResult(result);

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

    const setOwnProperty = <T>(record: Record<string, T>, key: string, value: T) => {
      Object.defineProperty(record, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    };

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
            setOwnProperty(valuesRecord, v.name, primal);
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
          setOwnProperty(reducedCostsRecord, v.name, rc);
        }
      }
    }

    // Map row duals and slacks back to Constraint objects
    if (result.duals) {
      for (const [cName, dual] of Object.entries(result.duals)) {
        const c = this.getConstraintByName(cName) || lpData.nameToConstraint.get(cName);
        if (c) {
          c.dual = dual;
          setOwnProperty(dualsRecord, c.name, dual);
        }
      }
    }

    if (result.slacks) {
      for (const [cName, slack] of Object.entries(result.slacks)) {
        const c = this.getConstraintByName(cName) || lpData.nameToConstraint.get(cName);
        if (c) {
          c.slack = slack;
          setOwnProperty(slacksRecord, c.name, slack);
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
   * Check satisfiability of the model without requiring an objective function.
   * Can be used to verify feasibility or diagnose infeasibilities / conflicts.
   * If the model is modified or a newer solve()/check() call is started before this
   * execution completes, the stale result is discarded and the returned promise rejects.
   */
  async check(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<CheckResult> {
    const opId = ++this.activeOperationId;
    const startRevision = this.modelRevision;
    this.clearSolutionFields();
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

    // Guard against primal initial values if solver lacks warm-start support
    if (
      this.variables.some((v) => v.initialValue !== undefined) &&
      activeSolver.capabilities?.supportsWarmStart !== true
    ) {
      throw new Error(
        `Solver "${activeSolver.name}" does not support primal initial values (initialValue). Please use a solver with warm-start support such as HiGHS.`
      );
    }

    const effectiveOptions = this.wrapSolveOptions(activeOptions, startRevision, opId);

    // 2. If solver implements native check() (e.g. Z3)
    if (typeof activeSolver.check === "function") {
      let checkResult: CheckResult;
      try {
        checkResult = await activeSolver.check(
          {
            name: this.name,
            variables: this.variables,
            boolVars: this.boolVars,
            constraints: this.constraints,
            logicalConstraints: this.logicalConstraints,
          },
          effectiveOptions
        );
      } catch (err) {
        if (this.activeOperationId === opId) {
          this.clearSolutionFields();
        }
        throw err;
      }

      this.ensureExecutionValid(startRevision, opId, "check");

      this.status = checkResult.status;
      this.terminationStatus = activeOptions.signal?.aborted ? "Interrupted" : checkResult.status;
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

    // 3. Fallback: Linear feasibility check using activeSolver.solve() with a zero objective
    // without mutating this.objectiveExpr or this.sense on the Model instance.
    const feasibilityModelData = {
      name: this.name,
      sense: "Minimize" as const,
      objective: new LinExpr(),
      constraints: this.constraints,
      variables: this.variables,
      logicalConstraints: this.logicalConstraints,
      boolVars: this.boolVars,
    };
    const lpData: LpExportResult = generateLpString(feasibilityModelData);

    let result: SolverResult;
    try {
      result = await activeSolver.solve(feasibilityModelData, lpData, effectiveOptions);
    } catch (err) {
      if (this.activeOperationId === opId) {
        this.clearSolutionFields();
      }
      throw err;
    }

    this.ensureExecutionValid(startRevision, opId, "check");

    this.runTime = result.runTime ?? 0;
    const rawStatus = result.status;
    const rawTermStatus = result.terminationStatus ?? rawStatus;
    const hasPrimal = this.hasPrimalFromResult(result);

    const isSat = hasPrimal || rawStatus === "Optimal" || rawStatus === "Feasible";
    const isUnsat = rawStatus === "Infeasible";
    const checkStatus = isSat ? "Sat" : isUnsat ? "Unsat" : "Unknown";

    this.status = checkStatus;
    this.terminationStatus =
      activeOptions.signal?.aborted || rawTermStatus === "Interrupted"
        ? "Interrupted"
        : rawTermStatus === "Optimal" || rawTermStatus === "Feasible" || rawTermStatus === "Infeasible"
          ? checkStatus
          : rawTermStatus;
    this.hasPrimalSolution = isSat;
    this.objectiveValue = null;
    this.objectiveBound = undefined;
    this.relGap = undefined;
    this.mipGap = undefined;
    this.absGap = undefined;
    this.solution = null;
    this.values.clear();

    const values: Record<string, number | boolean> = {};
    if (isSat && result.values) {
      for (const [vName, primal] of Object.entries(result.values)) {
        if (typeof primal === "number" && !Number.isNaN(primal)) {
          this.values.set(vName, primal);
          const v = this.getVarByName(vName) || lpData.nameToVar.get(vName);
          if (v) {
            v.value = primal;
            Object.defineProperty(values, v.name, {
              value: primal,
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }
          const bv = this.boolVars.find((b) => b.name === vName);
          if (bv) {
            bv.value = Boolean(primal);
            Object.defineProperty(values, bv.name, {
              value: bv.value,
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }
        }
      }
    }

    if (result.slacks) {
      for (const [cName, slack] of Object.entries(result.slacks)) {
        const c = this.getConstraintByName(cName) || lpData.nameToConstraint.get(cName);
        if (c) {
          c.slack = slack;
        }
      }
    }

    this.hasSolutionState = true;

    return {
      status: checkStatus,
      values,
      runTime: this.runTime,
    };
  }

  /**
   * Independently evaluate and verify variable bounds, integrality, linear constraints,
   * and logical (SMT/propositional) constraints against the model's current solution
   * or an explicit `values` map.
   */
  validateSolution(options: SolutionValidationOptions = {}): SolutionValidationReport {
    return validateModelSolution(this, options);
  }
}
