import type { ComparisonSense } from "./types.js";
import type { LinExpr } from "./expression.js";

let constrIdCounter = 0;

/**
 * Represents a linear constraint: lhs (terms) <=, >=, or == rhs (constant)
 * Compatible with PuLP (LpConstraint) and python-mip (Constr).
 */
export class Constraint {
  public readonly id: number;
  public lhs: LinExpr;
  public sense: ComparisonSense;
  public rhs: number;
  public name: string;

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
    this.lhs = lhs;
    this.sense = sense;
    this.rhs = rhs;
    this.name = name || `c_${this.id}`;
  }

  /** PuLP style dual price accessor */
  get pi(): number | null {
    return this.dual;
  }

  toString(): string {
    const senseSymbol = this.sense === "==" ? "=" : this.sense;
    return `${this.name}: ${this.lhs.toString()} ${senseSymbol} ${this.rhs}`;
  }
}
