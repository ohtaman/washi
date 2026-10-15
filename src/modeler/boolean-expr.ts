import type { Constraint } from "./constraint.js";

let boolVarIdCounter = 0;

export type LogicalOpType = "and" | "or" | "not" | "implies" | "xor" | "eq";

export type LogicElement = BoolExpr | Constraint;

/**
 * Base abstract class for Boolean expressions in SMT / SAT
 */
export abstract class BoolExpr {
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
}

/**
 * Boolean variable (propositional variable in SAT / SMT)
 */
export class BoolVar extends BoolExpr {
  public readonly id: number;
  public readonly name: string;
  public value: boolean | null = null;

  constructor(name?: string) {
    super();
    this.id = ++boolVarIdCounter;
    this.name = name || `p_${this.id}`;
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Compound Boolean operator AST node (And, Or, Not, Implies, Xor)
 */
export class BoolOp extends BoolExpr {
  public readonly op: LogicalOpType;
  public readonly children: LogicElement[];

  constructor(op: LogicalOpType, children: LogicElement[]) {
    super();
    this.op = op;
    this.children = children;
  }

  toString(): string {
    if (this.op === "not") {
      return `not(${this.children[0].toString()})`;
    }
    return `(${this.children.map((c) => c.toString()).join(` ${this.op} `)})`;
  }
}

// Global Functional Combinators
export function and(...exprs: LogicElement[]): BoolOp {
  if (exprs.length === 0) throw new Error("and() requires at least one expression");
  return new BoolOp("and", exprs);
}

export function or(...exprs: LogicElement[]): BoolOp {
  if (exprs.length === 0) throw new Error("or() requires at least one expression");
  return new BoolOp("or", exprs);
}

export function not(expr: LogicElement): BoolOp {
  return new BoolOp("not", [expr]);
}

export function implies(antecedent: LogicElement, consequent: LogicElement): BoolOp {
  return new BoolOp("implies", [antecedent, consequent]);
}

export function xor(...exprs: LogicElement[]): BoolOp {
  if (exprs.length === 0) throw new Error("xor() requires at least one expression");
  return new BoolOp("xor", exprs);
}
