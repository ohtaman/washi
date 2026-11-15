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
  if (
    typeof el === "object" &&
    el !== null &&
    "id" in el &&
    "name" in el &&
    "lb" in el &&
    "ub" in el &&
    !("sense" in el)
  ) {
    throw new Error(
      `Invalid operand passed to logical operator "${op}": expected a BoolVar, BoolExpr, or Constraint, but received numeric variable "${(el as { name: string }).name}". ` +
        `Use m.bool() for propositional variables, add a comparison such as expr\`\${x} == 1\`, or use m.indicator(binVar, constraint) for 0-1 Big-M indicator constraints.`
    );
  }
  throw new Error(
    `Invalid operand passed to logical operator "${op}": expected a BoolVar, BoolExpr, or Constraint.`
  );
}

/**
 * Base abstract class for propositional / SMT Boolean expressions (`BoolVar` and `BoolOp`).
 *
 * **Solver capability note**: Logical constraints are solved natively by Z3 (`{ solver: "z3" }`)
 * and automatically linearized into 0-1 MIP constraints on HiGHS and GLPK. Comparison `Constraint`s
 * in negated positions (`implies` antecedents, `not`, `xor`) require `Integer`/`Binary` variables
 * with integer coefficients and RHS on MIP backends (for `Continuous` or non-integer negated
 * constraints, use `{ solver: "z3" }`, or write `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`).
 */
export abstract class BoolExpr {
  /** Logical conjunction (`this AND other`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public and(other: LogicInput): BoolOp {
    return new BoolOp("and", [this, assertLogicElement(other, "and")]);
  }

  /** Logical disjunction (`this OR other`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public or(other: LogicInput): BoolOp {
    return new BoolOp("or", [this, assertLogicElement(other, "or")]);
  }

  /** Logical implication (`this => consequent`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public implies(consequent: LogicInput): BoolOp {
    return new BoolOp("implies", [this, assertLogicElement(consequent, "implies")]);
  }

  /** Logical exclusive-or (`this XOR other`). Requires a `BoolVar`, `BoolExpr`, or comparison `Constraint`. */
  public xor(other: LogicInput): BoolOp {
    return new BoolOp("xor", [this, assertLogicElement(other, "xor")]);
  }

  /** Logical negation (`NOT this`). */
  public not(): BoolOp {
    return new BoolOp("not", [this]);
  }
}

/**
 * Propositional Boolean variable (`true` / `false`) for logical / SMT modeling.
 * Created via `m.bool(...)`; solved natively on Z3 (`{ solver: "z3" }`) and automatically
 * linearized into a 0-1 MIP binary variable on HiGHS and GLPK.
 * For 0-1 arithmetic variables in linear sums or objectives, use `m.binary(...)` instead.
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
 * Compound Boolean operator AST node (`and`, `or`, `not`, `implies`, `xor`).
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

/**
 * Logical conjunction (`e1 AND e2 AND ...`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Z3 (`{ solver: "z3" }`) and automatically
 * linearized into 0-1 MIP constraints on HiGHS and GLPK. Passing an unconstrained arithmetic
 * expression (`LinExpr` / `QuadExpr`) throws an Error.
 *
 * @example
 * ```ts
 * const m = new Model("AndExample");
 * const a = m.bool("a");
 * const x = m.integer("x", { lb: 0, ub: 20 });
 * m.constraint(and(a, expr`${x} >= 10`), "both_active");
 * ```
 */
export function and(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("and() requires at least one expression");
  return new BoolOp("and", exprs);
}

/**
 * Logical disjunction (`e1 OR e2 OR ...`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Z3 (`{ solver: "z3" }`) and automatically
 * linearized via 0-1 MIP Big-M indicators on HiGHS and GLPK (variables in comparison branches
 * require finite bounds on MIP solvers). Passing an unconstrained arithmetic expression
 * (`LinExpr` / `QuadExpr`) throws an Error.
 *
 * @example
 * ```ts
 * const m = new Model("OrExample");
 * const x = m.integer("x", { lb: 0, ub: 20 });
 * m.constraint(or(expr`${x} <= 5`, expr`${x} >= 15`), "disjoint_range");
 * ```
 */
export function or(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("or() requires at least one expression");
  return new BoolOp("or", exprs);
}

/**
 * Logical negation (`NOT e`) of a `BoolVar`, `BoolExpr`, or linear comparison `Constraint`.
 *
 * **Solver capability note**: Solved natively by Z3 (`{ solver: "z3" }`) and automatically
 * linearized on HiGHS and GLPK. Negating a comparison `Constraint` on MIP backends uses exact
 * `+/- 1` integer shifts and requires `Integer`/`Binary` variables with integer coefficients and RHS;
 * for `Continuous` or non-integer constraints, use `{ solver: "z3" }`, or write an explicit
 * closed-tolerance disjunction `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`.
 *
 * @example
 * ```ts
 * const m = new Model("NotExample");
 * const blocked = m.bool("blocked");
 * m.constraint(not(blocked), "must_not_be_blocked");
 * ```
 */
export function not(expr: LogicInput): BoolOp {
  return new BoolOp("not", [expr]);
}

/**
 * Logical implication (`antecedent => consequent`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Z3 (`{ solver: "z3" }`) and automatically
 * linearized into 0-1 MIP constraints on HiGHS and GLPK. When `antecedent` contains a comparison
 * `Constraint`, MIP backends negate it via exact `+/- 1` integer shifts (`Integer`/`Binary` variables
 * with integer coefficients and RHS); if `antecedent` involves `Continuous` variables or non-integer
 * coefficients/thresholds, MIP solvers throw an Error—use `{ solver: "z3" }`, or rewrite explicitly
 * with `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`.
 *
 * @example
 * ```ts
 * const m = new Model("ImpliesExample");
 * const vip = m.bool("vip");
 * const discount = m.integer("discount", { lb: 0, ub: 50 });
 * m.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
 * ```
 */
export function implies(antecedent: LogicInput, consequent: LogicInput): BoolOp {
  return new BoolOp("implies", [antecedent, consequent]);
}

/**
 * Logical exclusive-or (`e1 XOR e2 ...`) over `BoolVar`, `BoolExpr`, or linear comparison `Constraint`s.
 *
 * **Solver capability note**: Solved natively by Z3 (`{ solver: "z3" }`) and automatically
 * linearized into 0-1 MIP constraints on HiGHS and GLPK. Comparison `Constraint` operands require
 * both positive and negated directions (`+/- 1` integer shifts over bounded `Integer`/`Binary`
 * variables with integer coefficients and RHS); for `Continuous` or non-integer constraints, use
 * `{ solver: "z3" }`, or model the propositions explicitly with `or(expr\`... >= ... + eps\`, ...)` / `m.bool()`.
 *
 * @example
 * ```ts
 * const m = new Model("XorExample");
 * const shiftA = m.bool("shiftA");
 * const shiftB = m.bool("shiftB");
 * m.constraint(xor(shiftA, shiftB), "exactly_one_shift");
 * ```
 */
export function xor(...exprs: LogicInput[]): BoolOp {
  if (exprs.length === 0) throw new Error("xor() requires at least one expression");
  return new BoolOp("xor", exprs);
}


