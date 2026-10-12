import type { Var } from "./variable.js";
import { Constraint } from "./constraint.js";
import { QuadExpr } from "./quad-expr.js";

/**
 * Represents a linear expression: c0 + c1*x1 + c2*x2 + ...
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
  add(other: QuadExpr): QuadExpr;
  add(other: LinExpr | Var | number): LinExpr;
  add(other: QuadExpr | LinExpr | Var | number): LinExpr | QuadExpr {
    if (other instanceof QuadExpr) {
      return other.add(this);
    }
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
  sub(other: QuadExpr): QuadExpr;
  sub(other: LinExpr | Var | number): LinExpr;
  sub(other: QuadExpr | LinExpr | Var | number): LinExpr | QuadExpr {
    if (other instanceof QuadExpr) {
      return other.neg().add(this);
    }
    if (typeof other === "number") {
      return this.add(-other);
    } else if ("terms" in other) {
      return this.add(other.mul(-1));
    } else {
      return this.add(other.mul(-1));
    }
  }

  /**
   * Multiply this expression by a scalar coefficient or variable
   */
  mul(scalar: number): LinExpr;
  mul(v: Var): QuadExpr;
  mul(operand: number | Var): LinExpr | QuadExpr {
    if (typeof operand === "number") {
      const result = new LinExpr(new Map(), this.constant * operand);
      for (const [v, c] of this.terms) {
        const prod = c * operand;
        if (Math.abs(prod) >= 1e-12) {
          result.terms.set(v, prod);
        }
      }
      return result;
    }
    // operand is Var: (c0 + sum(ci * xi)) * v = c0 * v + sum(ci * xi * v)
    let result = new QuadExpr();
    if (Math.abs(this.constant) >= 1e-12) {
      result.linearTerms.set(operand, this.constant);
    }
    for (const [v, c] of this.terms) {
      result = result.add(QuadExpr.fromProduct(v, operand, c));
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
   * Helper value accessor for expression
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
 * Union expression type covering linear and quadratic expressions.
 */
export type Expr = LinExpr | QuadExpr;

/**
 * Sum an array, iterable, or count-range of variables, expressions, or numbers.
 * Supports:
 * - sum([x, y, z])
 * - sum(items, item => expr)
 * - sum(10, i => expr) (range 0..9)
 */
export function sum(
  count: number,
  mapFn: (index: number) => LinExpr | Var | number
): LinExpr;
export function sum<T = any>(
  items: Iterable<T>,
  mapFn?: (item: T, index: number) => LinExpr | Var | number
): LinExpr;
export function sum<T = any>(
  arg1: number | Iterable<T>,
  arg2?: (item: any, index: number) => LinExpr | Var | number
): LinExpr {
  const terms = new Map<Var, number>();
  let constant = 0;

  function addVal(val: LinExpr | Var | number | undefined | null) {
    if (val === null || val === undefined) return;
    if (typeof val === "number") {
      constant += val;
    } else if (typeof val === "object" && "terms" in val) {
      const linExpr = val as LinExpr;
      for (const [v, c] of linExpr.terms) {
        const cur = terms.get(v) || 0;
        terms.set(v, cur + c);
      }
      constant += linExpr.constant;
    } else {
      const v = val as Var;
      const cur = terms.get(v) || 0;
      terms.set(v, cur + 1);
    }
  }

  if (typeof arg1 === "number") {
    const count = arg1;
    const mapFn = arg2!;
    for (let i = 0; i < count; i++) {
      addVal(mapFn(i, i));
    }
  } else {
    let index = 0;
    for (const item of arg1) {
      const val = arg2 ? arg2(item, index++) : (item as unknown as LinExpr | Var | number);
      addVal(val);
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
 * Compute the vector dot product (linear combination) of coefficients and variables.
 * Works with 1D/2D arrays and records in either order:
 * - dot(costs, vars)
 * - dot(vars, costs)
 * - dot(costMatrix, flowMatrix)
 */
export function dot(
  a: Record<string, any> | any[],
  b: Record<string, any> | any[]
): LinExpr {
  const terms = new Map<Var, number>();
  let constant = 0;

  function addProduct(coeff: number, exprOrVar: Var | LinExpr | number) {
    if (typeof exprOrVar === "number") {
      constant += coeff * exprOrVar;
    } else if (exprOrVar && typeof exprOrVar === "object" && "terms" in exprOrVar) {
      for (const [v, c] of (exprOrVar as LinExpr).terms) {
        const cur = terms.get(v) || 0;
        terms.set(v, cur + coeff * c);
      }
      constant += coeff * (exprOrVar as LinExpr).constant;
    } else if (exprOrVar) {
      const v = exprOrVar as Var;
      const cur = terms.get(v) || 0;
      terms.set(v, cur + coeff);
    }
  }

  function recurse(valA: any, valB: any, path: string = "") {
    if (valA === undefined || valB === undefined || valA === null || valB === null) {
      throw new Error(`Nullish or undefined operand encountered in dot() at '${path || "root"}'.`);
    }

    if (typeof valA === "number") {
      addProduct(valA, valB);
      return;
    }
    if (typeof valB === "number") {
      addProduct(valB, valA);
      return;
    }

    if (Array.isArray(valA) || Array.isArray(valB)) {
      if (!Array.isArray(valA) || !Array.isArray(valB)) {
        throw new Error(
          `Type mismatch in dot() at '${path || "root"}': one operand is an Array while the other is not.`
        );
      }
      if (valA.length !== valB.length) {
        throw new Error(
          `Array length mismatch in dot() at '${path || "root"}': received lengths ${valA.length} and ${valB.length}.`
        );
      }
      for (let i = 0; i < valA.length; i++) {
        recurse(valA[i], valB[i], path ? `${path}[${i}]` : `[${i}]`);
      }
      return;
    }

    if (typeof valA === "object" && typeof valB === "object") {
      const keysA = Object.keys(valA);
      const keysB = Object.keys(valB);

      const missingInB = keysA.filter((k) => !(k in valB));
      const missingInA = keysB.filter((k) => !(k in valA));

      if (missingInB.length > 0 || missingInA.length > 0) {
        const parts: string[] = [];
        if (missingInB.length > 0) parts.push(`missing in second operand: [${missingInB.join(", ")}]`);
        if (missingInA.length > 0) parts.push(`missing in first operand: [${missingInA.join(", ")}]`);
        throw new Error(
          `Key mismatch in dot() at '${path || "root"}': ${parts.join("; ")}.`
        );
      }

      for (const key of keysA) {
        recurse(valA[key], valB[key], path ? `${path}.${key}` : key);
      }
      return;
    }

    throw new Error(`Unsupported operand types in dot() at '${path || "root"}'.`);
  }

  recurse(a, b);

  for (const [v, c] of terms) {
    if (Math.abs(c) < 1e-12) {
      terms.delete(v);
    }
  }

  return new LinExpr(terms, constant);
}


