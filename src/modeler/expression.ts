import type { Var } from "./variable.js";
import { Constraint } from "./constraint.js";

/**
 * Represents a linear expression: c0 + c1*x1 + c2*x2 + ...
 * Compatible with PuLP (LpAffineExpression) and python-mip (LinExpr).
 */
export class LinExpr {
  public terms: Map<Var, number>;
  public constant: number;

  constructor(terms: Map<Var, number> = new Map(), constant: number = 0) {
    this.terms = new Map(terms);
    this.constant = constant;
  }

  /**
   * Clone this linear expression
   */
  clone(): LinExpr {
    return new LinExpr(this.terms, this.constant);
  }

  /**
   * Add another expression, variable, or number
   */
  add(other: LinExpr | Var | number): LinExpr {
    const result = this.clone();
    if (typeof other === "number") {
      result.constant += other;
    } else if ("terms" in other) {
      // other is LinExpr
      for (const [v, c] of other.terms) {
        const current = result.terms.get(v) || 0;
        const sumCoeff = current + c;
        if (Math.abs(sumCoeff) < 1e-12) {
          result.terms.delete(v);
        } else {
          result.terms.set(v, sumCoeff);
        }
      }
      result.constant += other.constant;
    } else {
      // other is Var
      const current = result.terms.get(other) || 0;
      const sumCoeff = current + 1;
      if (Math.abs(sumCoeff) < 1e-12) {
        result.terms.delete(other);
      } else {
        result.terms.set(other, sumCoeff);
      }
    }
    return result;
  }

  /**
   * Subtract another expression, variable, or number
   */
  sub(other: LinExpr | Var | number): LinExpr {
    if (typeof other === "number") {
      return this.add(-other);
    } else if ("terms" in other) {
      return this.add(other.mul(-1));
    } else {
      return this.add(other.mul(-1));
    }
  }

  /**
   * Multiply this expression by a scalar coefficient
   */
  mul(scalar: number): LinExpr {
    const result = new LinExpr(new Map(), this.constant * scalar);
    for (const [v, c] of this.terms) {
      const prod = c * scalar;
      if (Math.abs(prod) >= 1e-12) {
        result.terms.set(v, prod);
      }
    }
    return result;
  }

  /**
   * Divide this expression by a non-zero scalar
   */
  div(scalar: number): LinExpr {
    if (Math.abs(scalar) < 1e-12) {
      throw new Error("Division by zero in LinExpr.div()");
    }
    return this.mul(1 / scalar);
  }

  /**
   * Negate this expression
   */
  neg(): LinExpr {
    return this.mul(-1);
  }

  /**
   * Compute the numerical value of this expression using current variable values
   */
  get value(): number | null {
    let sum = this.constant;
    for (const [v, c] of this.terms) {
      if (v.value === null) {
        return null;
      }
      sum += c * v.value;
    }
    return sum;
  }

  /**
   * PuLP style value accessor
   */
  getValue(): number | null {
    return this.value;
  }

  /**
   * Create constraint: this <= rhs
   */
  le(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.toConstraint("<=", rhs, name);
  }
  lessThanOrEqual(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.le(rhs, name);
  }

  /**
   * Create constraint: this >= rhs
   */
  ge(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.toConstraint(">=", rhs, name);
  }
  greaterThanOrEqual(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.ge(rhs, name);
  }

  /**
   * Create constraint: this == rhs
   */
  eq(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.toConstraint("==", rhs, name);
  }
  equalTo(rhs: number | Var | LinExpr, name?: string): Constraint {
    return this.eq(rhs, name);
  }

  private toConstraint(sense: "<=" | ">=" | "==", rhs: number | Var | LinExpr, name?: string): Constraint {
    // Normalization: lhs terms on left, constant on right:
    // this - rhs_terms <= rhs_constant - this.constant
    let target = this.clone();
    let rhsConstant = 0;

    if (typeof rhs === "number") {
      rhsConstant = rhs;
    } else if ("terms" in rhs) {
      // rhs is LinExpr: subtract its terms and add its constant
      target = target.sub(new LinExpr(rhs.terms, 0));
      rhsConstant = rhs.constant;
    } else {
      // rhs is Var
      target = target.sub(rhs);
    }

    const finalRhs = rhsConstant - target.constant;
    target.constant = 0;

    return new Constraint(target, sense, finalRhs, name);
  }

  toString(): string {
    const parts: string[] = [];
    let isFirst = true;

    for (const [v, c] of this.terms) {
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
}

/**
 * Sum an array or iterable of variables, expressions, or numbers.
 * Also supports mapping functions: sum(items, item => expr)
 * Compatible with PuLP's lpSum and python-mip's xsum.
 */
export function sum<T = any>(
  items: Iterable<T>,
  mapFn?: (item: T, index: number) => LinExpr | Var | number
): LinExpr {
  const terms = new Map<Var, number>();
  let constant = 0;
  let index = 0;

  for (const item of items) {
    const val = mapFn ? mapFn(item, index++) : (item as unknown as LinExpr | Var | number);
    if (typeof val === "number") {
      constant += val;
    } else if (val && typeof val === "object" && "terms" in val) {
      const linExpr = val as LinExpr;
      for (const [v, c] of linExpr.terms) {
        const cur = terms.get(v) || 0;
        terms.set(v, cur + c);
      }
      constant += linExpr.constant;
    } else if (val) {
      const v = val as Var;
      const cur = terms.get(v) || 0;
      terms.set(v, cur + 1);
    }
  }

  // Prune negligible terms
  for (const [v, c] of terms) {
    if (Math.abs(c) < 1e-12) {
      terms.delete(v);
    }
  }

  return new LinExpr(terms, constant);
}

/**
 * python-mip style alias for sum
 */
export const xsum = sum;

/**
 * PuLP style alias for sum
 */
export const lpSum = sum;
