import type { ComparisonSense } from "./types.js";
import type { LinExpr } from "./expression.js";
import { BoolOp, type LogicElement } from "./boolean-expr.js";

let constrIdCounter = 0;

/**
 * Represents a linear constraint: lhs (terms) <=, >=, or == rhs (constant)
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
