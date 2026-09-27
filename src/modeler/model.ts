import type {
  VarType,
  OptimizationSense,
  SolverStatus,
  SolveOptions,
  SolverSolution,
} from "./types.js";
import { Var, type VarOptions } from "./variable.js";
import { LinExpr } from "./expression.js";
import { Constraint } from "./constraint.js";
import { parseExpr, parseConstraint } from "./parser.js";
import { generateLpString, type LpExportResult } from "./lp-writer.js";
import { getSolver, type Solver, type SolverOptions, type SolverResult } from "./solvers/index.js";

export interface ModelOptions {
  name?: string;
  sense?: OptimizationSense;
  solver?: Solver | string;
}

/**
 * High-level intuitive mathematical programming model.
 * Inspired by PuLP (Python) and python-mip, running directly with HiGHS WASM in browser and Node.js.
 */
export class Model {
  public name: string;
  public sense: OptimizationSense;
  public objective: LinExpr;
  public variables: Var[] = [];
  public constraints: Constraint[] = [];

  private varMapByName = new Map<string, Var>();
  private constrMapByName = new Map<string, Constraint>();

  public status: SolverStatus = "NotSolved";
  public objectiveValue: number | null = null;
  public runTime: number = 0;
  public solution: SolverSolution | null = null;
  public solver: Solver | null = null;

  constructor(options: ModelOptions = {}) {
    this.name = options.name || "OptimizationModel";
    this.sense = options.sense || "Minimize";
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
   * Add a decision variable to the model
   */
  addVar(options?: VarOptions): Var;
  addVar(name: string, type?: VarType, lb?: number, ub?: number): Var;
  addVar(
    arg1?: string | VarOptions,
    arg2?: VarType,
    arg3?: number,
    arg4?: number
  ): Var {
    let opts: VarOptions;

    if (typeof arg1 === "string") {
      opts = {
        name: arg1,
        type: arg2,
        lb: arg3,
        ub: arg4,
      };
    } else {
      opts = arg1 || {};
    }

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
   * Add multiple variables at once:
   * - by count: addVars(5) -> Var[]
   * - by key array: addVars(["apples", "oranges"]) -> Record<string, Var>
   */
  addVars(count: number, options?: VarOptions): Var[];
  addVars<K extends string | number>(keys: K[], options?: VarOptions): Record<K, Var>;
  addVars(countOrKeys: number | (string | number)[], options?: VarOptions): Var[] | Record<string, Var> {
    if (typeof countOrKeys === "number") {
      const result: Var[] = [];
      const prefix = options?.name || "x";
      for (let i = 0; i < countOrKeys; i++) {
        result.push(
          this.addVar({
            ...options,
            name: `${prefix}_${i}`,
          })
        );
      }
      return result;
    } else {
      const result: Record<string, Var> = {};
      const prefix = options?.name;
      for (const key of countOrKeys) {
        const varName = prefix ? `${prefix}_${key}` : `${key}`;
        result[key] = this.addVar({
          ...options,
          name: varName,
        });
      }
      return result;
    }
  }

  /**
   * Add a 2D matrix of decision variables: grid[row][col]
   */
  addVars2D<R extends string | number, C extends string | number>(
    rows: R[],
    cols: C[],
    options?: VarOptions
  ): Record<R, Record<C, Var>> {
    const matrix: any = {};
    const prefix = options?.name || "x";
    for (const r of rows) {
      matrix[r] = {};
      for (const c of cols) {
        matrix[r][c] = this.addVar({
          ...options,
          name: `${prefix}_${r}_${c}`,
        });
      }
    }
    return matrix;
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
  setObjective(expr: LinExpr | Var | number | string, sense?: OptimizationSense): void {
    if (sense) {
      this.sense = sense;
    }

    if (typeof expr === "string") {
      this.objective = parseExpr(expr, (name) => this.getVarByName(name));
    } else if (typeof expr === "number") {
      this.objective = new LinExpr(new Map(), expr);
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
  maximize(expr: LinExpr | Var | number | string): void {
    this.setObjective(expr, "Maximize");
  }

  /**
   * Set objective to minimize
   */
  minimize(expr: LinExpr | Var | number | string): void {
    this.setObjective(expr, "Minimize");
  }

  /**
   * Add a linear constraint to the model
   */
  addConstraint(constraint: Constraint | string, name?: string): Constraint {
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
   * python-mip / Gurobi style alias for addConstraint
   */
  addConstr(constraint: Constraint | string, name?: string): Constraint {
    return this.addConstraint(constraint, name);
  }

  /**
   * Add multiple constraints
   */
  addConstrs(constraints: (Constraint | string)[]): Constraint[] {
    return constraints.map((c) => this.addConstraint(c));
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
   * or a solver passed dynamically (PuLP style: prob.solve(solver))
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
    } else if (typeof solverOrOptions === "string") {
      activeSolver = getSolver(solverOrOptions, options);
      activeOptions = options || {};
    } else {
      activeSolver = this.solver || getSolver();
      activeOptions = (solverOrOptions as SolveOptions) || {};
    }

    const modelData = {
      name: this.name,
      sense: this.sense,
      objective: this.objective,
      constraints: this.constraints,
      variables: this.variables,
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

    // Map variable solutions back to Var objects
    if (result.values) {
      for (const [vName, primal] of Object.entries(result.values)) {
        const v = this.getVarByName(vName) || lpData.nameToVar.get(vName);
        if (v) {
          v.value = primal;
          valuesRecord[v.name] = primal;
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
   * PuLP style alias for optimize:
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
}
