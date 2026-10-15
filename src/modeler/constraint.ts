import type { ComparisonSense } from "./types.js";
import type { LinExpr } from "./expression.js";
import { BoolOp, type LogicElement } from "./boolean-expr.js";

let constrIdCounter = 0;

/**
 * Represents a linear constraint: lhs (terms) <=, >=, or == rhs (constant)
 */
export class Constraint {
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
  public and(other: LogicElement): BoolOp {
    return new BoolOp("and", [this, other]);
  }

  public or(other: LogicElement): BoolOp {
    return new BoolOp("or", [this, other]);
  }

  public implies(consequent: LogicElement): BoolOp {
    return new BoolOp("implies", [this, consequent]);
  }

  public xor(other: LogicElement): BoolOp {
    return new BoolOp("xor", [this, other]);
  }

  public not(): BoolOp {
    return new BoolOp("not", [this]);
  }

  toString(): string {
    const senseSymbol = this.sense === "==" ? "=" : this.sense;
    return `${this.name}: ${this.lhs.toString()} ${senseSymbol} ${this.rhs}`;
  }
}
