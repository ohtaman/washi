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

function normalizeVarType(type?: VarType): "Continuous" | "Integer" | "Binary" {
  if (!type) return "Continuous";
  const lower = type.toLowerCase();
  if (lower === "binary" || lower === "bin") return "Binary";
  if (lower === "integer" || lower === "int") return "Integer";
  return "Continuous";
}

/**
 * Represents a decision variable in an optimization problem.
 */
export class Var {
  public readonly id: number;
  private _name: string;
  public readonly prefix: string;
  public hasExplicitName: boolean;
  public ownerModel: unknown = null;
  public type: "Continuous" | "Integer" | "Binary";
  public lb: number;
  public ub: number;

  /** Optimal primal value after solve */
  public value: number | null = null;
  /** Reduced cost from dual solution */
  public reducedCost: number | null = null;

  constructor(options: VarOptions = {}) {
    this.id = ++varIdCounter;
    const explicitName = typeof options.name === "string" ? options.name.trim() : "";
    const rawPrefix = typeof options.prefix === "string" ? options.prefix.trim() : "";
    this.prefix = rawPrefix.length > 0 ? rawPrefix : "x";
    this.hasExplicitName = explicitName.length > 0;
    this._name = this.hasExplicitName ? explicitName : `${this.prefix}_${this.id}`;
    this.type = normalizeVarType(options.type);

    if (this.type === "Binary") {
      this.lb = 0;
      this.ub = 1;
    } else {
      this.lb = options.lb !== undefined ? options.lb : 0;
      this.ub = options.ub !== undefined ? options.ub : Infinity;
    }
  }

  get name(): string {
    return this._name;
  }

  /** @internal Assigns a model-scoped name when registering an unnamed Var via Model.add() */
  _assignModelName(name: string): void {
    this._name = name;
  }

  /** Multiply variable by a scalar coefficient or another variable/expression */
  mul(coeff: number): LinExpr;
  mul(other: Var): QuadExpr;
  mul(other: LinExpr): QuadExpr;
  mul(other: QuadExpr): QuadExpr;
  mul(other: number | Var | LinExpr | QuadExpr): LinExpr | QuadExpr;
  mul(other: number | Var | LinExpr | QuadExpr): LinExpr | QuadExpr {
    if (typeof other === "number") {
      if (other === 0) {
        return new LinExpr(new Map(), 0);
      }
      return new LinExpr(new Map([[this, other]]), 0);
    }
    if (other instanceof Var) {
      return QuadExpr.fromProduct(this, other, 1);
    }
    if (other instanceof QuadExpr) {
      if (other.quadTerms.size > 0) {
        throw new Error("Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)");
      }
      let result = new QuadExpr();
      if (other.constant !== 0) {
        result.linearTerms.set(this, other.constant);
      }
      for (const [v, c] of other.linearTerms) {
        result = result.add(QuadExpr.fromProduct(this, v, c));
      }
      return result;
    }
    // LinExpr: this * (c0 + sum(ci * xi)) = c0 * this + sum(ci * this * xi)
    let result = new QuadExpr();
    if (other.constant !== 0) {
      result.linearTerms.set(this, other.constant);
    }
    for (const [v, c] of other.terms) {
      const qTerm = QuadExpr.fromProduct(this, v, c);
      result = result.add(qTerm);
    }
    return result;
  }

  /** Add variable with another variable, linear/quadratic expression, or number */
  add(other: QuadExpr): QuadExpr;
  add(other: Var | LinExpr | number): LinExpr;
  add(other: Var | LinExpr | QuadExpr | number): LinExpr | QuadExpr;
  add(other: Var | LinExpr | QuadExpr | number): LinExpr | QuadExpr {
    if (other instanceof QuadExpr) {
      return other.add(this);
    }
    return new LinExpr(new Map([[this, 1]]), 0).add(other);
  }

  /** Subtract another variable, linear/quadratic expression, or number from this variable */
  sub(other: QuadExpr): QuadExpr;
  sub(other: Var | LinExpr | number): LinExpr;
  sub(other: Var | LinExpr | QuadExpr | number): LinExpr | QuadExpr;
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
