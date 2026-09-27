import type { VarType } from "./types.js";
import { LinExpr } from "./expression.js";
import { Constraint } from "./constraint.js";

let varIdCounter = 0;

export interface VarOptions {
  name?: string;
  type?: VarType;
  lb?: number;
  ub?: number;
}

/**
 * Represents a decision variable in an optimization problem.
 * Compatible with both PuLP (LpVariable) and python-mip (Var).
 */
export class Var {
  public readonly id: number;
  public readonly name: string;
  public type: VarType;
  public lb: number;
  public ub: number;

  /** Optimal primal value after solve */
  public value: number | null = null;
  /** Reduced cost from dual solution */
  public reducedCost: number | null = null;

  constructor(options: VarOptions = {}) {
    this.id = ++varIdCounter;
    this.name = options.name || `x_${this.id}`;
    this.type = options.type || "Continuous";

    if (this.type === "Binary") {
      this.lb = 0;
      this.ub = 1;
    } else {
      this.lb = options.lb !== undefined ? options.lb : 0;
      this.ub = options.ub !== undefined ? options.ub : Infinity;
    }
  }

  /** python-mip style value accessor */
  get x(): number | null {
    return this.value;
  }

  /** PuLP style value accessor */
  get varValue(): number | null {
    return this.value;
  }

  /** Multiply variable by a scalar coefficient */
  mul(coeff: number): LinExpr {
    return new LinExpr(new Map([[this, coeff]]), 0);
  }

  /** Add variable with another variable, linear expression, or number */
  add(other: Var | LinExpr | number): LinExpr {
    return new LinExpr(new Map([[this, 1]]), 0).add(other);
  }

  /** Subtract another variable, linear expression, or number from this variable */
  sub(other: Var | LinExpr | number): LinExpr {
    return new LinExpr(new Map([[this, 1]]), 0).sub(other);
  }

  /** Negate this variable: -x */
  neg(): LinExpr {
    return this.mul(-1);
  }

  /** Create a less-than-or-equal constraint: this <= rhs */
  le(rhs: number | Var | LinExpr, name?: string): Constraint {
    return new LinExpr(new Map([[this, 1]]), 0).le(rhs, name);
  }
  lessThanOrEqual(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.le(rhs, name);
  }

  /** Create a greater-than-or-equal constraint: this >= rhs */
  ge(rhs: number | Var | LinExpr, name?: string): Constraint {
    return new LinExpr(new Map([[this, 1]]), 0).ge(rhs, name);
  }
  greaterThanOrEqual(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.ge(rhs, name);
  }

  /** Create an equality constraint: this == rhs */
  eq(rhs: number | Var | LinExpr, name?: string): Constraint {
    return new LinExpr(new Map([[this, 1]]), 0).eq(rhs, name);
  }
  equalTo(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.eq(rhs, name);
  }

  toString(): string {
    return this.name;
  }
}
