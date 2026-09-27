import { Model as CoreModel } from "./model.js";
import { Var } from "./variable.js";
import { LinExpr, xsum } from "./expression.js";
import { Constraint } from "./constraint.js";
import type { VarType, OptimizationSense, SolverStatus, SolveOptions } from "./types.js";

export const MINIMIZE: OptimizationSense = "Minimize";
export const MAXIMIZE: OptimizationSense = "Maximize";

export const BINARY: VarType = "Binary";
export const INTEGER: VarType = "Integer";
export const CONTINUOUS: VarType = "Continuous";

export interface ObjectiveSpec {
  expr: LinExpr | Var | number | string;
  sense: OptimizationSense;
}

export function maximize(expr: LinExpr | Var | number | string): ObjectiveSpec {
  return { expr, sense: MAXIMIZE };
}

export function minimize(expr: LinExpr | Var | number | string): ObjectiveSpec {
  return { expr, sense: MINIMIZE };
}

/**
 * python-mip compatible Model class
 */
export class MipModel extends CoreModel {
  constructor(name: string = "MipModel", sense: OptimizationSense = MINIMIZE) {
    super({ name, sense });
  }

  /**
   * python-mip style variable creation: m.add_var(name="x", var_type=INTEGER, lb=0)
   */
  add_var(options: {
    name?: string;
    var_type?: VarType;
    lb?: number;
    ub?: number;
  } = {}): Var {
    return this.addVar({
      name: options.name,
      type: options.var_type,
      lb: options.lb,
      ub: options.ub,
    });
  }

  /**
   * python-mip style objective property setter:
   * m.objective = maximize(30 * x + 50 * y)
   */
  set objective_spec(spec: ObjectiveSpec) {
    this.setObjective(spec.expr, spec.sense);
  }

  get objective_value(): number | null {
    return this.objectiveValue;
  }

  /**
   * Add constraint alias
   */
  add_constr(constraint: Constraint | string, name?: string): Constraint {
    return this.addConstraint(constraint, name);
  }
}

export { xsum };
