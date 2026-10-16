import type { ComparisonSense } from "./types.js";
import type { LinExpr } from "./expression.js";
import { BoolOp, type LogicInput } from "./boolean-expr.js";

let constrIdCounter = 0;

/**
 * Represents a linear constraint: lhs (terms) <=, >=, or == rhs (constant)
 */
export class Constraint {
  public readonly kind = "constraint" as const;
  public readonly id: number;
  private _lhs: LinExpr;
  private _sense: ComparisonSense;
  private _rhs: number;
  private _name: string;
  public hasExplicitName: boolean;
  public ownerModel: { notifyMutation?: () => void } | null = null;
  /** Slack value after solve */
  public slack: number | null = null;
  /** Dual value (shadow price) after solve */
  public dual: number | null = null;

  constructor(
    lhs: LinExpr,
    sense: ComparisonSense,
    rhs: number,
    name?: string
  ) {
    this.id = ++constrIdCounter;
    this._lhs = lhs;
    this._sense = sense;
    this._rhs = rhs;
    const trimmed = typeof name === "string" ? name.trim() : undefined;
    if (trimmed && trimmed.length > 0) {
      this._name = trimmed;
      this.hasExplicitName = true;
    } else {
      this._name = `c_${this.id}`;
      this.hasExplicitName = false;
    }
  }

  get lhs(): LinExpr {
    return this._lhs;
  }

  set lhs(value: LinExpr) {
    if (this._lhs !== value) {
      this._lhs = value;
      this.ownerModel?.notifyMutation?.();
    }
  }

  get sense(): ComparisonSense {
    return this._sense;
  }

  set sense(value: ComparisonSense) {
    if (this._sense !== value) {
      this._sense = value;
      this.ownerModel?.notifyMutation?.();
    }
  }

  get rhs(): number {
    return this._rhs;
  }

  set rhs(value: number) {
    if (!Object.is(this._rhs, value)) {
      this._rhs = value;
      this.ownerModel?.notifyMutation?.();
    }
  }

  get name(): string {
    return this._name;
  }

  set name(value: string) {
    if (this._name !== value) {
      this._name = value;
      this.ownerModel?.notifyMutation?.();
    }
    this.hasExplicitName = true;
  }

  /** @internal Assigns a model-scoped name and explicit flag without triggering setter mutation notifications */
  _assignModelName(name: string, hasExplicitName: boolean): void {
    this._name = name;
    this.hasExplicitName = hasExplicitName;
  }

  // Logical operators for SMT / SAT
  public and(other: LogicInput): BoolOp {
    return new BoolOp("and", [this, other]);
  }

  public or(other: LogicInput): BoolOp {
    return new BoolOp("or", [this, other]);
  }

  public implies(consequent: LogicInput): BoolOp {
    return new BoolOp("implies", [this, consequent]);
  }

  public xor(other: LogicInput): BoolOp {
    return new BoolOp("xor", [this, other]);
  }

  public not(): BoolOp {
    return new BoolOp("not", [this]);
  }

  // Runtime guards for arithmetic / comparison chaining on unified expr`...` results
  public add(_other: unknown): never {
    throw new Error(
      "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
    );
  }

  public sub(_other: unknown): never {
    throw new Error(
      "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
    );
  }

  public mul(_other: unknown): never {
    throw new Error(
      "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
    );
  }

  public div(_other: unknown): never {
    throw new Error(
      "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
    );
  }

  public neg(): never {
    throw new Error(
      "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
    );
  }

  public le(_rhs: unknown, _name?: string): never {
    throw new Error(
      "Cannot compare a Constraint in (<=): expected a number, Var, or LinExpr."
    );
  }

  public ge(_rhs: unknown, _name?: string): never {
    throw new Error(
      "Cannot compare a Constraint in (>=): expected a number, Var, or LinExpr."
    );
  }

  public eq(_rhs: unknown, _name?: string): never {
    throw new Error(
      "Cannot compare a Constraint in (==): expected a number, Var, or LinExpr."
    );
  }

  public get value(): never {
    throw new Error(
      "Cannot read numeric value of a Constraint: expected a Var, LinExpr, or QuadExpr."
    );
  }

  public get constant(): never {
    throw new Error(
      "Cannot read numeric constant of a Constraint: expected a LinExpr or QuadExpr."
    );
  }

  public clone(): Constraint {
    return new Constraint(
      this._lhs.clone(),
      this._sense,
      this._rhs,
      this.hasExplicitName ? this._name : undefined
    );
  }

  toString(): string {
    const senseSymbol = this.sense === "==" ? "=" : this.sense;
    return `${this.name}: ${this.lhs.toString()} ${senseSymbol} ${this.rhs}`;
  }
}

export function isConstraint(val: unknown): val is Constraint {
  return (
    val instanceof Constraint ||
    (typeof val === "object" &&
      val !== null &&
      "sense" in val &&
      "lhs" in val &&
      "rhs" in val)
  );
}

