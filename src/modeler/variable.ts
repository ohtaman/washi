import type { VarType } from "./types.js";
import { LinExpr } from "./expression.js";
import { Constraint } from "./constraint.js";
import { QuadExpr } from "./quad-expr.js";

let varIdCounter = 0;

export interface VarOptions {
  name?: string;
  prefix?: string;
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

  /** Multiply variable by a scalar coefficient or another variable/expression */
  mul(coeff: number): LinExpr;
  mul(other: Var): QuadExpr;
  mul(other: LinExpr): QuadExpr;
  mul(other: number | Var | LinExpr): LinExpr | QuadExpr {
    if (typeof other === "number") {
      return new LinExpr(new Map([[this, other]]), 0);
    }
    if (other instanceof Var) {
      return QuadExpr.fromProduct(this, other, 1);
    }
    // LinExpr: this * (c0 + sum(ci * xi)) = c0 * this + sum(ci * this * xi)
    let result = new QuadExpr();
    if (Math.abs(other.constant) >= 1e-12) {
      result.linearTerms.set(this, other.constant);
    }
    for (const [v, c] of other.terms) {
      const qTerm = QuadExpr.fromProduct(this, v, c);
      result = result.add(qTerm);
    }
    return result;
  }

  /** Add variable with another variable, linear/quadratic expression, or number */
  add(other: Var | LinExpr | QuadExpr | number): LinExpr | QuadExpr {
    if (other instanceof QuadExpr) {
      return other.add(this);
    }
    return new LinExpr(new Map([[this, 1]]), 0).add(other);
  }

  /** Subtract another variable, linear/quadratic expression, or number from this variable */
  sub(other: Var | LinExpr | QuadExpr | number): LinExpr | QuadExpr {
    if (other instanceof QuadExpr) {
      return other.neg().add(this);
    }
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
