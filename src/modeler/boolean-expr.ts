import { Constraint } from "./constraint.js";
import type { LinExpr } from "./expression.js";
import type { QuadExpr } from "./quad-expr.js";

let boolVarIdCounter = 0;

export type LogicalOpType = "and" | "or" | "not" | "implies" | "xor" | "eq";

export type LogicElement = BoolExpr | Constraint;

export type LogicInput = LogicElement | LinExpr | QuadExpr;

function assertLogicElement(el: unknown, op: string): LogicElement {
  if (el instanceof BoolExpr || el instanceof Constraint) {
    return el;
  }
  if (
    typeof el === "object" &&
    el !== null &&
    ("terms" in el || "quadTerms" in el)
  ) {
    throw new Error(
      `Cannot use an arithmetic expression without a comparison operator (<=, >=, ==) in logical operator "${op}". ` +
        `Use a comparison constraint such as expr\`\${x} <= 10\` or a BoolVar/BoolExpr.`
    );
  }
  throw new Error(
    `Invalid operand passed to logical operator "${op}": expected a BoolVar, BoolExpr, or Constraint.`
  );
}

/**
 * Base abstract class for Boolean expressions in SMT / SAT
 */
export abstract class BoolExpr {
  public and(other: LogicInput): BoolOp {
    return new BoolOp("and", [this, assertLogicElement(other, "and")]);
  }

  public or(other: LogicInput): BoolOp {
    return new BoolOp("or", [this, assertLogicElement(other, "or")]);
  }

  public implies(consequent: LogicInput): BoolOp {
    return new BoolOp("implies", [this, assertLogicElement(consequent, "implies")]);
  }

  public xor(other: LogicInput): BoolOp {
    return new BoolOp("xor", [this, assertLogicElement(other, "xor")]);
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

  constructor(op: LogicalOpType, children: LogicInput[]) {
    super();
    this.op = op;
    this.children = children.map((c) => assertLogicElement(c, op));
  }

  toString(): string {
    if (this.op === "not") {
      return `not(${this.children[0].toString()})`;
    }
    return `(${this.children.map((c) => c.toString()).join(` ${this.op} `)})`;
  }
}

// Global Functional Combinators
export function and(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("and() requires at least one expression");
  return new BoolOp("and", exprs);
}

export function or(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("or() requires at least one expression");
  return new BoolOp("or", exprs);
}

export function not(expr: LogicInput): BoolOp {
  return new BoolOp("not", [expr]);
}

export function implies(antecedent: LogicInput, consequent: LogicInput): BoolOp {
  return new BoolOp("implies", [antecedent, consequent]);
}

export function xor(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("xor() requires at least one expression");
  return new BoolOp("xor", exprs);
}

