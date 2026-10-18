import type { VarType } from "./types.js";
import { LinExpr } from "./expression.js";
import { Constraint } from "./constraint.js";
import { QuadExpr } from "./quad-expr.js";
import { validateVarBounds } from "./validation.js";

let varIdCounter = 0;

export interface VarOptions {
  name?: string;
  prefix?: string;
  type?: VarType;
  lb?: number;
  ub?: number;
  /**
   * Optional finite primal initial value (MIP start / warm-start hint), distinct from solved `Var.value`.
   * Validated within tolerance `1e-6` against `[lb, ub]` and integer/binary domains.
   * Supported by HiGHS (`supportsWarmStart: true`); throws on solvers without warm-start support (GLPK, Z3).
   */
  initialValue?: number;
}

function normalizeVarType(type?: VarType): "Continuous" | "Integer" | "Binary" {
  if (type === undefined) return "Continuous";
  if (typeof type === "string") {
    const lower = type.toLowerCase();
    if (lower === "binary" || lower === "bin") return "Binary";
    if (lower === "integer" || lower === "int") return "Integer";
    if (lower === "continuous" || lower === "cont") return "Continuous";
  }
  throw new Error(
    `Invalid variable type "${String(type)}": expected "Continuous", "Integer", or "Binary".`
  );
}

/**
 * Represents a numeric decision variable (`"Continuous"`, `"Integer"`, or `"Binary"`) in an optimization model.
 * Typically created and registered via `m.continuous(...)`, `m.integer(...)`, or `m.binary(...)`.
 *
 * @example
 * ```ts
 * const m = new Model("VarExample");
 * const x = m.continuous("x", { lb: 0, ub: 100 });
 * const y = m.integer("y", { lb: 0, ub: 10, initialValue: 5 });
 * m.objective(maximize(x.mul(2).add(y.mul(5))));
 * m.constraint(x.add(y).le(50));
 * ```
 */
export class Var {
  public readonly id: number;
  private _name: string;
  public readonly prefix: string;
  public hasExplicitName: boolean;
  public ownerModel: { notifyMutation?: () => void } | null = null;
  private _type: "Continuous" | "Integer" | "Binary";
  private _lb: number;
  private _ub: number;
  private _initialValue: number | undefined;

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
    this._type = normalizeVarType(options.type);

    if (this._type === "Binary") {
      this._lb = 0;
      this._ub = 1;
    } else {
      this._lb = options.lb !== undefined ? options.lb : 0;
      this._ub = options.ub !== undefined ? options.ub : Infinity;
    }

    this._initialValue =
      options.initialValue !== undefined
        ? Object.is(options.initialValue, -0)
          ? 0
          : options.initialValue
        : undefined;

    if (this._initialValue !== undefined) {
      validateVarBounds(this);
    }
  }

  get name(): string {
    return this._name;
  }

  get type(): "Continuous" | "Integer" | "Binary" {
    return this._type;
  }

  set type(val: VarType) {
    const normalized = normalizeVarType(val);
    if (this._type !== normalized) {
      this._type = normalized;
      this.ownerModel?.notifyMutation?.();
    }
  }

  get lb(): number {
    return this._lb;
  }

  set lb(val: number) {
    if (!Object.is(this._lb, val)) {
      this._lb = val;
      this.ownerModel?.notifyMutation?.();
    }
  }

  get ub(): number {
    return this._ub;
  }

  set ub(val: number) {
    if (!Object.is(this._ub, val)) {
      this._ub = val;
      this.ownerModel?.notifyMutation?.();
    }
  }

  /**
   * Optional finite primal initial value (MIP start / warm-start hint), distinct from solved `Var.value`.
   * Supported by HiGHS (`supportsWarmStart: true`); throws on solvers without warm-start support (GLPK, Z3).
   */
  get initialValue(): number | undefined {
    return this._initialValue;
  }

  set initialValue(val: number | undefined) {
    const normalized = val !== undefined && Object.is(val, -0) ? 0 : val;
    if (!Object.is(this._initialValue, normalized)) {
      this._initialValue = normalized;
      this.ownerModel?.notifyMutation?.();
    }
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
  mul(other: number | Var | LinExpr | QuadExpr | Constraint): LinExpr | QuadExpr;
  mul(other: number | Var | LinExpr | QuadExpr | Constraint): LinExpr | QuadExpr {
    if (typeof other === "number") {
      return new LinExpr(new Map([[this, 1]]), 0).mul(other);
    }
    return new QuadExpr(new Map([[this, 1]]), new Map(), 0).mul(other);
  }

  /** Add variable with another variable, linear/quadratic expression, or number */
  add(other: QuadExpr): QuadExpr;
  add(other: Var | LinExpr | number): LinExpr;
  add(other: Var | LinExpr | QuadExpr | number | Constraint): LinExpr | QuadExpr;
  add(other: Var | LinExpr | QuadExpr | number | Constraint): LinExpr | QuadExpr {
    if (other instanceof QuadExpr) {
      return other.add(this);
    }
    return new LinExpr(new Map([[this, 1]]), 0).add(other);
  }

  /** Subtract another variable, linear/quadratic expression, or number from this variable */
  sub(other: QuadExpr): QuadExpr;
  sub(other: Var | LinExpr | number): LinExpr;
  sub(other: Var | LinExpr | QuadExpr | number | Constraint): LinExpr | QuadExpr;
  sub(other: Var | LinExpr | QuadExpr | number | Constraint): LinExpr | QuadExpr {
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
  le(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return new LinExpr(new Map([[this, 1]]), 0).le(rhs, name);
  }

  /** Create a greater-than-or-equal constraint: this >= rhs */
  ge(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return new LinExpr(new Map([[this, 1]]), 0).ge(rhs, name);
  }

  /** Create an equality constraint: this == rhs */
  eq(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return new LinExpr(new Map([[this, 1]]), 0).eq(rhs, name);
  }

  toString(): string {
    return this.name;
  }
}
