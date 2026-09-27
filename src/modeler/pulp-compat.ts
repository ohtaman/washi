import { Model } from "./model.js";
import { Var } from "./variable.js";
import { LinExpr, sum, lpSum } from "./expression.js";
import { Constraint } from "./constraint.js";
import type { VarType, OptimizationSense, SolverStatus, SolveOptions } from "./types.js";
import {
  type Solver,
  HiGHS,
  RemoteSolver,
  MockSolver,
  getSolver,
  listAvailableSolvers,
} from "./solvers/index.js";

// PuLP Constants
export const LpMinimize: OptimizationSense = "Minimize";
export const LpMaximize: OptimizationSense = "Maximize";

export const LpContinuous: VarType = "Continuous";
export const LpInteger: VarType = "Integer";
export const LpBinary: VarType = "Binary";

export const LpStatus: Record<SolverStatus, string> = {
  Optimal: "Optimal",
  Infeasible: "Infeasible",
  Unbounded: "Unbounded",
  TimeLimit: "Not Solved (Time Limit)",
  IterationLimit: "Not Solved (Iteration Limit)",
  Error: "Error",
  NotSolved: "Not Solved",
};

/**
 * PuLP-compatible LpVariable
 */
export class LpVariable extends Var {
  constructor(
    name: string,
    lowBound?: number,
    upBound?: number,
    cat: VarType = "Continuous"
  ) {
    super({
      name,
      lb: lowBound !== undefined ? lowBound : 0,
      ub: upBound !== undefined ? upBound : Infinity,
      type: cat,
    });
  }

  /**
   * PuLP-style LpVariable.dicts helper:
   * LpVariable.dicts("x", [0, 1, 2], 0, 1, LpBinary)
   */
  static dicts<K extends string | number>(
    name: string,
    indices: K[],
    lowBound?: number,
    upBound?: number,
    cat: VarType = "Continuous"
  ): Record<K, LpVariable> {
    const result: Record<K, LpVariable> = {} as any;
    for (const idx of indices) {
      const vName = `${name}_${idx}`;
      result[idx] = new LpVariable(vName, lowBound, upBound, cat);
    }
    return result;
  }
}

/**
 * PuLP value() helper to extract value of variable or expression
 */
export function value(item: Var | LinExpr | number | null | undefined): number | null {
  if (item === null || item === undefined) return null;
  if (typeof item === "number") return item;
  return item.value;
}

/**
 * PuLP-compatible LpProblem class
 */
export class LpProblem {
  public model: Model;

  constructor(name: string = "NoName", sense: OptimizationSense = LpMinimize) {
    this.model = new Model({ name, sense });
  }

  get name(): string {
    return this.model.name;
  }

  get sense(): OptimizationSense {
    return this.model.sense;
  }

  set sense(val: OptimizationSense) {
    this.model.sense = val;
  }

  get objective(): LinExpr {
    return this.model.objective;
  }

  get variables(): Var[] {
    return this.model.variables;
  }

  get constraints(): Constraint[] {
    return this.model.constraints;
  }

  get status(): SolverStatus {
    return this.model.status;
  }

  get objectiveValue(): number | null {
    return this.model.objectiveValue;
  }

  /**
   * Register a variable to the problem
   */
  addVariable(v: Var): Var {
    if (!this.model.getVarByName(v.name)) {
      this.model.variables.push(v);
      (this.model as any).varMapByName.set(v.name, v);
    }
    return v;
  }

  /**
   * Set objective function
   */
  setObjective(expr: LinExpr | Var | number | string): void {
    if (typeof expr === "object" && expr !== null) {
      if ("terms" in expr) {
        for (const [v] of expr.terms) {
          this.addVariable(v);
        }
      } else if (expr instanceof Var) {
        this.addVariable(expr);
      }
    }
    this.model.setObjective(expr);
  }

  /**
   * Add a constraint
   */
  addConstraint(constraint: Constraint | string, name?: string): Constraint {
    if (typeof constraint === "object" && constraint !== null && "lhs" in constraint) {
      for (const [v] of constraint.lhs.terms) {
        this.addVariable(v);
      }
    }
    return this.model.addConstraint(constraint, name);
  }

  /**
   * Convenient method to add either an objective or constraint
   */
  add(item: Constraint | LinExpr | Var | string, name?: string): void {
    if (typeof item === "string") {
      if (/(<=|>=|==|=<|=>|=)/.test(item)) {
        this.addConstraint(item, name);
      } else {
        this.setObjective(item);
      }
    } else if (item instanceof Constraint) {
      this.addConstraint(item, name);
    } else {
      this.setObjective(item);
    }
  }

  /**
   * Solve the problem using specified solver (e.g. prob.solve(new HiGHS()), prob.solve(new GLPK()))
   * or default solver
   */
  async solve(
    solverOrOptions?: Solver | string | SolveOptions,
    options?: SolveOptions
  ): Promise<SolverStatus> {
    return this.model.optimize(solverOrOptions, options);
  }

  toLpString(): string {
    return this.model.toLpString();
  }
}

export {
  lpSum,
  HiGHS,
  RemoteSolver,
  MockSolver,
  getSolver,
  listAvailableSolvers,
};
