import type { Var } from "./variable.js";
import { LinExpr } from "./expression.js";

/**
 * Key representation for quadratic pair (v1, v2) with normalized ordering (id1 <= id2)
 */
function makeQuadKey(v1: Var, v2: Var): string {
  const id1 = v1.id;
  const id2 = v2.id;
  return id1 <= id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

export interface QuadTerm {
  var1: Var;
  var2: Var;
  coeff: number;
}

import { type Constraint, isConstraint } from "./constraint.js";

/**
 * Represents a quadratic expression:
 * constant + sum(c_i * x_i) + sum(q_ij * x_i * x_j)
 */
export class QuadExpr {
  public readonly kind = "quadratic" as const;
  public linearTerms: Map<Var, number>;
  public quadTerms: Map<string, QuadTerm>;
  public constant: number;

  constructor(
    linearTerms: Map<Var, number> = new Map(),
    quadTerms: Map<string, QuadTerm> = new Map(),
    constant: number = 0
  ) {
    this.linearTerms = new Map(linearTerms);
    this.quadTerms = new Map();
    for (const [key, term] of quadTerms) {
      this.quadTerms.set(key, { ...term });
    }
    this.constant = constant;
  }

  /**
   * Clone this quadratic expression
   */
  clone(): QuadExpr {
    return new QuadExpr(this.linearTerms, this.quadTerms, this.constant);
  }

  /**
   * Get coefficient for a quadratic term x1 * x2
   */
  getQuadCoeff(v1: Var, v2: Var): number {
    const key = makeQuadKey(v1, v2);
    const term = this.quadTerms.get(key);
    return term ? term.coeff : 0;
  }

  /**
   * Add another expression, variable, or number
   */
  add(other: QuadExpr | LinExpr | Var | number | Constraint): QuadExpr {
    if (isConstraint(other)) {
      throw new Error(
        "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
      );
    }
    const result = this.clone();
    if (typeof other === "number") {
      result.constant += other;
      return result;
    }

    if (other instanceof QuadExpr) {
      // Add quadratic terms
      for (const [key, term] of other.quadTerms) {
        const current = result.quadTerms.get(key);
        const currentCoeff = current ? current.coeff : 0;
        const sumCoeff = currentCoeff + term.coeff;
        if (sumCoeff === 0) {
          result.quadTerms.delete(key);
        } else {
          result.quadTerms.set(key, {
            var1: term.var1,
            var2: term.var2,
            coeff: sumCoeff,
          });
        }
      }
      // Add linear terms
      for (const [v, c] of other.linearTerms) {
        const current = result.linearTerms.get(v) ?? 0;
        const sumCoeff = current + c;
        if (sumCoeff === 0) {
          result.linearTerms.delete(v);
        } else {
          result.linearTerms.set(v, sumCoeff);
        }
      }
      result.constant += other.constant;
      return result;
    }

    // Check if it's LinExpr (has `terms` map)
    if ("terms" in other && other.terms instanceof Map) {
      for (const [v, c] of other.terms) {
        const current = result.linearTerms.get(v) ?? 0;
        const sumCoeff = current + c;
        if (sumCoeff === 0) {
          result.linearTerms.delete(v);
        } else {
          result.linearTerms.set(v, sumCoeff);
        }
      }
      result.constant += other.constant;
      return result;
    }

    // Otherwise it is a Var
    const v = other as Var;
    const current = result.linearTerms.get(v) ?? 0;
    const sumCoeff = current + 1;
    if (sumCoeff === 0) {
      result.linearTerms.delete(v);
    } else {
      result.linearTerms.set(v, sumCoeff);
    }
    return result;
  }

  /**
   * Subtract another expression, variable, or number
   */
  sub(other: QuadExpr | LinExpr | Var | number | Constraint): QuadExpr {
    if (isConstraint(other)) {
      throw new Error(
        "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
      );
    }
    if (typeof other === "number") {
      return this.add(-other);
    }
    return this.add(other.mul(-1));
  }

  /**
   * Multiply by a scalar coefficient, variable, or linear/quadratic expression
   */
  mul(scalar: number): QuadExpr;
  mul(other: Var | LinExpr | QuadExpr | Constraint): QuadExpr;
  mul(operand: number | Var | LinExpr | QuadExpr | Constraint): QuadExpr;
  mul(operand: number | Var | LinExpr | QuadExpr | Constraint): QuadExpr {
    if (isConstraint(operand)) {
      throw new Error(
        "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
      );
    }
    if (typeof operand === "number") {
      const hasTerms = this.linearTerms.size > 0 || this.quadTerms.size > 0;
      const rawConst =
        this.constant === 0 && hasTerms ? 0 : this.constant * operand;
      if (this.constant !== 0 && operand !== 0 && rawConst === 0) {
        throw new Error("Constant multiplication underflows to zero.");
      }
      const result = new QuadExpr(new Map(), new Map(), rawConst);
      for (const [v, c] of this.linearTerms) {
        const prod = c * operand;
        if (c !== 0 && operand !== 0 && prod === 0) {
          throw new Error("Coefficient multiplication underflows to zero.");
        }
        if (prod !== 0) {
          result.linearTerms.set(v, prod);
        }
      }
      for (const [k, term] of this.quadTerms) {
        const prod = term.coeff * operand;
        if (term.coeff !== 0 && operand !== 0 && prod === 0) {
          throw new Error("Coefficient multiplication underflows to zero.");
        }
        if (prod !== 0) {
          result.quadTerms.set(k, {
            var1: term.var1,
            var2: term.var2,
            coeff: prod,
          });
        }
      }
      return result;
    }

    const isVar =
      "id" in operand &&
      "name" in operand &&
      !("terms" in operand) &&
      !("quadTerms" in operand);
    const otherQuadSize = "quadTerms" in operand ? operand.quadTerms.size : 0;
    const otherLinTerms: ReadonlyMap<Var, number> = isVar
      ? new Map([[operand as Var, 1]])
      : "quadTerms" in operand
        ? operand.linearTerms
        : operand.terms;
    const otherConstant = isVar ? 0 : operand.constant;

    if (
      (this.quadTerms.size > 0 && (otherQuadSize > 0 || otherLinTerms.size > 0)) ||
      (otherQuadSize > 0 && this.linearTerms.size > 0)
    ) {
      throw new Error(
        "Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)"
      );
    }

    if (otherQuadSize === 0 && otherLinTerms.size === 0) {
      return this.mul(otherConstant);
    }
    if (this.quadTerms.size === 0 && this.linearTerms.size === 0 && !isVar) {
      const scaled = operand.mul(this.constant);
      if ("quadTerms" in scaled) {
        return scaled;
      }
      return new QuadExpr(scaled.terms, new Map(), scaled.constant);
    }

    return QuadExpr.multiplyLinearTerms(
      this.constant,
      this.linearTerms,
      otherConstant,
      otherLinTerms
    );
  }

  /**
   * Divide by a non-zero scalar or constant-only expression
   */
  div(divisor: number | LinExpr | QuadExpr | Constraint): QuadExpr {
    const scalar = QuadExpr.extractScalarDivisor(divisor, "QuadExpr.div()");
    return this.mul(1 / scalar);
  }

  /**
   * Negate this quadratic expression
   */
  neg(): QuadExpr {
    return this.mul(-1);
  }

  /**
   * Compute the numerical value of this expression using current variable values
   */
  get value(): number | null {
    let sum = this.constant;
    for (const [v, c] of this.linearTerms) {
      if (v.value === null) return null;
      sum += c * v.value;
    }
    for (const term of this.quadTerms.values()) {
      if (term.var1.value === null || term.var2.value === null) return null;
      sum += term.coeff * term.var1.value * term.var2.value;
    }
    return sum;
  }

  getValue(): number | null {
    return this.value;
  }

  public le(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toConstraint("<=", rhs, name);
  }

  public lessThanOrEqual(
    rhs: number | Var | LinExpr | QuadExpr | Constraint,
    name?: string
  ): Constraint {
    return this.le(rhs, name);
  }

  public ge(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toConstraint(">=", rhs, name);
  }

  public greaterThanOrEqual(
    rhs: number | Var | LinExpr | QuadExpr | Constraint,
    name?: string
  ): Constraint {
    return this.ge(rhs, name);
  }

  public eq(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toConstraint("==", rhs, name);
  }

  public equalTo(
    rhs: number | Var | LinExpr | QuadExpr | Constraint,
    name?: string
  ): Constraint {
    return this.eq(rhs, name);
  }

  private toConstraint(
    sense: "<=" | ">=" | "==",
    rhs: number | Var | LinExpr | QuadExpr | Constraint,
    name?: string
  ): Constraint {
    if (this.quadTerms.size > 0) {
      throw new Error(
        `Quadratic expressions are not supported in linear constraints (${sense}): quadratic terms are only allowed in objectives.`
      );
    }
    const lin = new LinExpr(this.linearTerms, this.constant);
    return sense === "<="
      ? lin.le(rhs, name)
      : sense === ">="
        ? lin.ge(rhs, name)
        : lin.eq(rhs, name);
  }

  public and(_other: unknown): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==) in logical 'and': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public or(_other: unknown): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==) in logical 'or': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public implies(_consequent: unknown): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==) in logical 'implies': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public xor(_other: unknown): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==) in logical 'xor': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public not(): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==) in logical 'not': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  toString(): string {
    const parts: string[] = [];
    let isFirst = true;

    for (const term of this.quadTerms.values()) {
      const c = term.coeff;
      const sign = c >= 0 ? (isFirst ? "" : "+ ") : "- ";
      const absC = Math.abs(c);
      const coeffStr = absC === 1 ? "" : `${absC} `;
      if (term.var1 === term.var2) {
        parts.push(`${sign}${coeffStr}${term.var1.name}^2`);
      } else {
        parts.push(`${sign}${coeffStr}${term.var1.name} * ${term.var2.name}`);
      }
      isFirst = false;
    }

    for (const [v, c] of this.linearTerms) {
      const sign = c >= 0 ? (isFirst ? "" : "+ ") : "- ";
      const absC = Math.abs(c);
      const coeffStr = absC === 1 ? "" : `${absC} `;
      parts.push(`${sign}${coeffStr}${v.name}`);
      isFirst = false;
    }

    if (this.constant !== 0 || parts.length === 0) {
      const sign = this.constant >= 0 ? (isFirst ? "" : "+ ") : "- ";
      parts.push(`${sign}${Math.abs(this.constant)}`);
    }

    return parts.join(" ") || "0";
  }

  /**
   * Factory method to create a quadratic term v1 * v2 * coeff
   */
  static fromProduct(v1: Var, v2: Var, coeff: number = 1): QuadExpr {
    const expr = new QuadExpr();
    if (coeff === 0) {
      return expr;
    }
    const key = makeQuadKey(v1, v2);
    expr.quadTerms.set(key, {
      var1: v1.id <= v2.id ? v1 : v2,
      var2: v1.id <= v2.id ? v2 : v1,
      coeff,
    });
    return expr;
  }

  /**
   * Canonical linear-by-linear multiplication shared across Var, LinExpr, QuadExpr, and Parser.
   */
  static multiplyLinearTerms(
    constantA: number,
    termsA: ReadonlyMap<Var, number>,
    constantB: number,
    termsB: ReadonlyMap<Var, number>
  ): QuadExpr {
    const hasTerms = termsA.size > 0 || termsB.size > 0;
    const rawConst =
      (constantA === 0 || constantB === 0) && hasTerms ? 0 : constantA * constantB;
    if (constantA !== 0 && constantB !== 0 && rawConst === 0) {
      throw new Error("Constant multiplication underflows to zero.");
    }
    let result = new QuadExpr(
      new Map(),
      new Map(),
      rawConst === 0 ? 0 : rawConst
    );
    if (constantB !== 0) {
      for (const [v, c] of termsA) {
        const prod = c * constantB;
        if (c !== 0 && prod === 0) {
          throw new Error("Coefficient multiplication underflows to zero.");
        }
        if (prod !== 0) {
          result.linearTerms.set(v, prod);
        }
      }
    }
    if (constantA !== 0) {
      for (const [v, c] of termsB) {
        const current = result.linearTerms.get(v) ?? 0;
        const added = c * constantA;
        if (c !== 0 && added === 0) {
          throw new Error("Coefficient multiplication underflows to zero.");
        }
        const sumCoeff = current + added;
        if (sumCoeff === 0) {
          result.linearTerms.delete(v);
        } else {
          result.linearTerms.set(v, sumCoeff);
        }
      }
    }
    for (const [v1, c1] of termsA) {
      for (const [v2, c2] of termsB) {
        const prod = c1 * c2;
        if (c1 !== 0 && c2 !== 0 && prod === 0) {
          throw new Error("Coefficient multiplication underflows to zero.");
        }
        result = result.add(QuadExpr.fromProduct(v1, v2, prod));
      }
    }
    return result;
  }

  /**
   * Validates and extracts a non-zero scalar divisor from a number or constant-only expression.
   */
  static extractScalarDivisor(
    divisor: number | LinExpr | QuadExpr | Constraint,
    context: string
  ): number {
    if (isConstraint(divisor)) {
      throw new Error(
        "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
      );
    }
    if (typeof divisor === "number") {
      if (divisor === 0) {
        throw new Error(`Division by zero in ${context}`);
      }
      return divisor;
    }
    const linSize = "quadTerms" in divisor ? divisor.linearTerms.size : divisor.terms.size;
    const quadSize = "quadTerms" in divisor ? divisor.quadTerms.size : 0;
    if (linSize > 0 || quadSize > 0) {
      throw new Error("Cannot divide by variable in expression");
    }
    if (divisor.constant === 0) {
      throw new Error(`Division by zero in ${context}`);
    }
    return divisor.constant;
  }
}
