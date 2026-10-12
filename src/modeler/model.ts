import {
  type VarType,
  type OptimizationSense,
  normalizeSense,
  type SolverStatus,
  type SolveOptions,
  type SolverSolution,
} from "./types.js";
import { Var, type VarOptions } from "./variable.js";
import { LinExpr } from "./expression.js";
import { QuadExpr } from "./quad-expr.js";
import { Constraint } from "./constraint.js";
import { BoolVar, BoolExpr } from "./boolean-expr.js";
import { parseExpr, parseConstraint } from "./parser.js";
import { generateLpString, type LpExportResult } from "./lp-writer.js";
import { getSolver, type Solver, type SolverOptions, type SolverResult } from "./solvers/index.js";

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

export interface IndicatorOptions {
  activeValue?: 0 | 1;
  M?: number;
  name?: string;
}

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
  public objective: LinExpr | QuadExpr;
  public variables: Var[] = [];
  public constraints: Constraint[] = [];
  public boolVars: BoolVar[] = [];
  public logicalConstraints: LogicalConstraint[] = [];
  public unsatCore: string[] = [];
  public values = new Map<string, number | boolean>();

  private varMapByName = new Map<string, Var>();
  private constrMapByName = new Map<string, Constraint>();

  public status: SolverStatus = "NotSolved";
  public objectiveValue: number | null = null;
  public runTime: number = 0;
  public solution: SolverSolution | null = null;
  public solver: Solver | null = null;

  constructor(nameOrOptions: string | ModelOptions = {}, maybeOptions?: ModelOptions) {
    let options: ModelOptions;
    if (typeof nameOrOptions === "string") {
      options = { ...maybeOptions, name: nameOrOptions };
    } else {
      options = nameOrOptions;
    }
    this.name = options.name || "OptimizationModel";
    this.sense = normalizeSense(options.sense);
    this.objective = new LinExpr();
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

    // 1D single variable: arg1 is string
    if (typeof arg1 === "string") {
      const opts = (arg2 as BoundsOptions) || {};
      return this.addVar({
        ...opts,
        type: domainType,
        name: arg1,
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
            name: `${p}_${i}`,
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
   * - m.binary(5) -> Var[]
   * - m.binary(["a", "b"]) -> Record<string, Var>
   * - m.binary(rows, cols) -> Record<string, Record<string, Var>>
   */
  binary(name: string): Var;
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
  binary(arg1: any, arg2?: any, arg3?: any): any {
    return this.createDomainVars("Binary", arg1, arg2, arg3);
  }

  /**
   * Create integer variable(s) (y in Z).
   * Supports:
   * - m.integer("y", { lb: 0, ub: 10 }) -> Var
   * - m.integer(5, { lb: 0 }) -> Var[]
   * - m.integer(["a", "b"], { lb: 0, ub: 5 }) -> Record<string, Var>
   * - m.integer(rows, cols, options) -> Record<string, Record<string, Var>>
   */
  integer(name: string, options?: BoundsOptions): Var;
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
  integer(arg1: any, arg2?: any, arg3?: any): any {
    return this.createDomainVars("Integer", arg1, arg2, arg3);
  }

  /**
   * Create continuous (real) variable(s) (z in R).
   * Supports:
   * - m.continuous("z", { lb: 0 }) -> Var
   * - m.continuous(5, { lb: 0 }) -> Var[]
   * - m.continuous(["a", "b"], { lb: 0 }) -> Record<string, Var>
   * - m.continuous(rows, cols, options) -> Record<string, Record<string, Var>>
   */
  continuous(name: string, options?: BoundsOptions): Var;
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
  continuous(arg1: any, arg2?: any, arg3?: any): any {
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
  bool(name?: string): BoolVar;
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

    // 1D single variable or no args
    if (typeof arg1 === "string" || arg1 === undefined) {
      return this.createBoolVar(arg1);
    }

    // 1D multiple variables: count (number) or keys (array/iterable)
    const opts = (arg2 as { prefix?: string; name?: string }) || {};
    const prefix = opts.prefix || opts.name;
    if (typeof arg1 === "number") {
      const result: BoolVar[] = [];
      const p = prefix || "p";
      for (let i = 0; i < arg1; i++) {
        result.push(this.createBoolVar(`${p}_${i}`));
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

  private createBoolVar(name?: string): BoolVar {
    const bv = new BoolVar(name);
    this.boolVars.push(bv);
    return bv;
  }

  /**
   * Internal variable creator
   */
  private addVar(options?: VarOptions): Var {
    const opts = options || {};
    const v = new Var(opts);

    // Validate unique name
    if (this.varMapByName.has(v.name)) {
      throw new Error(`Variable with name '${v.name}' already exists in model`);
    }

    this.variables.push(v);
    this.varMapByName.set(v.name, v);
    return v;
  }

  /**
   * Find variable by name
   */
  getVarByName(name: string): Var | undefined {
    return this.varMapByName.get(name);
  }

  /**
   * Find a constraint by its name
   */
  getConstraintByName(name: string): Constraint | undefined {
    return this.constrMapByName.get(name);
  }

  /**
   * Set the objective function
   */
  setObjective(expr: LinExpr | QuadExpr | Var | number | string | Constraint, sense?: OptimizationSense): void {
    if (expr instanceof Constraint) {
      throw new Error(
        "Cannot set objective to a constraint comparison (<=, >=, ==). " +
        "Did you mean to use m.constrain(expr`... <= ...`)? For objectives, supply an unconstrained expression like expr`45 * ${x} + 80 * ${y}`."
      );
    }

    if (sense) {
      this.sense = normalizeSense(sense);
    }

    if (typeof expr === "string") {
      this.objective = parseExpr(expr, (name) => this.getVarByName(name));
    } else if (typeof expr === "number") {
      this.objective = new LinExpr(new Map(), expr);
    } else if (expr instanceof QuadExpr) {
      this.objective = expr.clone();
    } else if ("terms" in expr) {
      this.objective = expr.clone();
    } else {
      // Var
      this.objective = new LinExpr(new Map([[expr, 1]]), 0);
    }
  }

  /**
   * Set objective to maximize
   */
  maximize(expr: LinExpr | QuadExpr | Var | number | string | Constraint): void {
    this.setObjective(expr, "Maximize");
  }

  /**
   * Set objective to minimize
   */
  minimize(expr: LinExpr | QuadExpr | Var | number | string | Constraint): void {
    this.setObjective(expr, "Minimize");
  }

  /**
   * Constrain the model with linear, boolean, or string formula constraints (primary default API).
   * Supports single constraint, array of constraints, and fluent chaining:
   * - m.constrain(expr`${desks} + 2 * ${chairs} <= 40`, "wood")
   * - m.constrain(items.map(i => expr`${x[i]} <= 10`))
   * - m.constrain(c1).constrain(c2)
   */
  constrain(constraint: Constraint | LinExpr | BoolExpr | string, name?: string): this;
  constrain(constraints: (Constraint | LinExpr | BoolExpr | string)[]): this;
  constrain(
    item: Constraint | LinExpr | BoolExpr | string | (Constraint | LinExpr | BoolExpr | string)[],
    name?: string
  ): this {
    if (Array.isArray(item)) {
      for (const elem of item) {
        this.constrain(elem);
      }
      return this;
    }
    if (item instanceof LinExpr) {
      throw new Error(
        "Cannot add a linear expression without a comparison operator (<=, >=, ==) as a constraint. " +
        "Use expr`... <= ...` or .le(), .ge(), .eq()."
      );
    }
    this.addConstraint(item as Constraint | BoolExpr | string, name);
    return this;
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
  private addConstraint(constraint: Constraint | LinExpr | string, name?: string): Constraint;
  private addConstraint(constraint: BoolExpr, name?: string): BoolExpr;
  private addConstraint(constraint: Constraint | LinExpr | BoolExpr | string, name?: string): Constraint | BoolExpr;
  private addConstraint(constraint: Constraint | LinExpr | BoolExpr | string, name?: string): Constraint | BoolExpr {
    if (constraint instanceof LinExpr) {
      throw new Error(
        "Cannot add a linear expression without a comparison operator (<=, >=, ==) as a constraint. " +
        "Use expr`... <= ...` or .le(), .ge(), .eq()."
      );
    }
    if (constraint instanceof BoolExpr) {
      const constrName = name || `lc_${this.logicalConstraints.length + 1}`;
      this.logicalConstraints.push({
        name: constrName,
        expr: constraint,
      });
      return constraint;
    }

    let constr: Constraint;

    if (typeof constraint === "string") {
      constr = parseConstraint(constraint, (varName) => this.getVarByName(varName), name);
    } else {
      constr = constraint;
      if (name) {
        constr.name = name;
      }
    }

    if (this.constrMapByName.has(constr.name)) {
      throw new Error(`Constraint with name '${constr.name}' already exists in model`);
    }

    this.constraints.push(constr);
    this.constrMapByName.set(constr.name, constr);
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
      if (!this.varMapByName.has(item.name)) {
        this.variables.push(item);
        this.varMapByName.set(item.name, item);
      }
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
    constraint: Constraint | LinExpr,
    options: IndicatorOptions = {}
  ): Constraint[] {
    if (!("sense" in constraint) || !("lhs" in constraint)) {
      throw new Error(
        "Invalid constraint expression passed to indicator(). Expression must include a comparison operator (<=, >=, ==)."
      );
    }
    const resolvedConstraint = constraint as Constraint;
    const activeVal = options.activeValue !== undefined ? options.activeValue : 1;
    const M = options.M !== undefined ? options.M : 1e5;
    const baseName = options.name || `ind_${binVar.name}_${resolvedConstraint.name}`;
    const addedConstrs: Constraint[] = [];

    const { lhs, sense, rhs } = resolvedConstraint;

    if (activeVal === 1) {
      if (sense === "<=" || sense === "==") {
        // lhs <= rhs + M*(1 - binVar) <=> lhs + M*binVar <= rhs + M
        const cLe = this.addConstraint(
          lhs.add(binVar.mul(M)).le(rhs + M),
          sense === "==" ? `${baseName}_le` : baseName
        );
        addedConstrs.push(cLe);
      }
      if (sense === ">=" || sense === "==") {
        // lhs >= rhs - M*(1 - binVar) <=> lhs - M*binVar >= rhs - M
        const cGe = this.addConstraint(
          lhs.sub(binVar.mul(M)).ge(rhs - M),
          sense === "==" ? `${baseName}_ge` : baseName
        );
        addedConstrs.push(cGe);
      }
    } else {
      // activeVal === 0: holds when binVar == 0, relaxed by M*binVar
      if (sense === "<=" || sense === "==") {
        // lhs <= rhs + M*binVar <=> lhs - M*binVar <= rhs
        const cLe = this.addConstraint(
          lhs.sub(binVar.mul(M)).le(rhs),
          sense === "==" ? `${baseName}_le` : baseName
        );
        addedConstrs.push(cLe);
      }
      if (sense === ">=" || sense === "==") {
        // lhs >= rhs - M*binVar <=> lhs + M*binVar >= rhs
        const cGe = this.addConstraint(
          lhs.add(binVar.mul(M)).ge(rhs),
          sense === "==" ? `${baseName}_ge` : baseName
        );
        addedConstrs.push(cGe);
      }
    }

    return addedConstrs;
  }

  /**
   * Export model to CPLEX LP format string
   */
  toLpString(): string {
    const { lpString } = generateLpString({
      name: this.name,
      sense: this.sense,
      objective: this.objective,
      constraints: this.constraints,
      variables: this.variables,
    });
    return lpString;
  }

  /**
   * Solve the optimization model using the configured solver (defaults to HiGHS WASM)
   * or a solver passed dynamically (e.g., await model.optimize(new HiGHS()))
   */
  async optimize(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<SolverStatus> {
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
      this.objective instanceof QuadExpr && this.objective.quadTerms.size > 0;
    if (hasQuadObjective && activeSolver.capabilities?.supportsQP === false) {
      throw new Error(
        `Solver "${activeSolver.name}" does not support quadratic objectives (QP). Please use a QP-capable solver such as HiGHS or Clarabel.`
      );
    }

    const modelData = {
      name: this.name,
      sense: this.sense,
      objective: this.objective,
      constraints: this.constraints,
      variables: this.variables,
      logicalConstraints: this.logicalConstraints,
      boolVars: this.boolVars,
    };

    const lpData: LpExportResult = generateLpString(modelData);

    const result: SolverResult = await activeSolver.solve(modelData, lpData, activeOptions);

    this.runTime = result.runTime ?? 0;
    this.status = result.status;
    this.objectiveValue = result.objectiveValue ?? null;

    const valuesRecord: Record<string, number> = {};
    const dualsRecord: Record<string, number> = {};
    const reducedCostsRecord: Record<string, number> = {};
    const slacksRecord: Record<string, number> = {};

    this.values.clear();

    // Reset previous variable and constraint solutions
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
    if (lpData?.nameToVar) {
      for (const v of lpData.nameToVar.values()) {
        v.value = null;
        v.reducedCost = null;
      }
    }
    if (lpData?.nameToConstraint) {
      for (const c of lpData.nameToConstraint.values()) {
        c.dual = null;
        c.slack = null;
      }
    }

    // Map variable solutions back to Var objects
    if (result.values && result.status !== "Infeasible" && result.status !== "Unbounded") {
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
      objectiveValue: this.objectiveValue,
      values: valuesRecord,
      duals: dualsRecord,
      reducedCosts: reducedCostsRecord,
      slacks: slacksRecord,
      runTime: this.runTime,
      raw: result.raw,
    };

    return this.status;
  }

  /**
   * Convenience alias for optimize():
   * await model.solve()
   * await model.solve(new HiGHS())
   * await model.solve(new GLPK())
   * await model.solve(new RemoteSolver({ url: "..." }))
   */
  async solve(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<SolverStatus> {
    return this.optimize(solverOrOptions, options);
  }

  /**
   * Check satisfiability of the model without requiring an objective function.
   * Can be used to verify feasibility or diagnose infeasibilities / unsat core.
   */
  async check(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<{
    status: "Sat" | "Unsat" | "Unknown";
    values: Record<string, number | boolean>;
    unsatCore?: string[];
    runTime?: number;
  }> {
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
      this.runTime = checkResult.runTime ?? 0;
      this.unsatCore = checkResult.unsatCore || [];

      this.values.clear();
      for (const v of this.variables) {
        v.value = null;
      }
      for (const bv of this.boolVars) {
        bv.value = null;
      }

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
      return checkResult;
    }

    // 3. Fallback: Linear Feasibility check using standard solve() with 0 objective
    const originalObjective = this.objective;
    const originalSense = this.sense;
    try {
      this.objective = new LinExpr();
      this.sense = "Minimize";
      const status = await this.optimize(activeSolver, activeOptions);
      const isSat = status === "Optimal" || status === "Feasible";
      const isUnsat = status === "Infeasible";

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
        status: isSat ? "Sat" : isUnsat ? "Unsat" : "Unknown",
        values,
        runTime: this.runTime,
      };
    } finally {
      this.objective = originalObjective;
      this.sense = originalSense;
    }
  }
}
