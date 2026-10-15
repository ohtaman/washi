import { Var } from "./variable.js";
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
  add(other: QuadExpr | LinExpr | Var | number): LinExpr | QuadExpr;
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
        if (sumCoeff === 0) {
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
      if (sumCoeff === 0) {
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
  sub(other: QuadExpr | LinExpr | Var | number): LinExpr | QuadExpr;
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
   * Multiply this expression by a scalar coefficient, variable, or expression
   */
  mul(scalar: number): LinExpr;
  mul(v: Var): QuadExpr;
  mul(other: LinExpr): LinExpr | QuadExpr;
  mul(other: QuadExpr): QuadExpr;
  mul(operand: number | Var | LinExpr | QuadExpr): LinExpr | QuadExpr;
  mul(operand: number | Var | LinExpr | QuadExpr): LinExpr | QuadExpr {
    if (typeof operand === "number") {
      const rawConst = this.constant * operand;
      const result = new LinExpr(
        new Map(),
        rawConst === 0 ? 0 : rawConst
      );
      for (const [v, c] of this.terms) {
        const prod = c * operand;
        if (prod !== 0) {
          result.terms.set(v, prod);
        }
      }
      return result;
    }
    const isVar = operand instanceof Var || (typeof operand === "object" && operand !== null && "id" in operand && !("terms" in operand) && !("quadTerms" in operand));
    if (isVar) {
      const vOperand = operand as Var;
      let result = new QuadExpr();
      if (this.constant !== 0) {
        result.linearTerms.set(vOperand, this.constant);
      }
      for (const [v, c] of this.terms) {
        result = result.add(QuadExpr.fromProduct(v, vOperand, c));
      }
      return result;
    }
    if (operand instanceof QuadExpr) {
      if (operand.quadTerms.size > 0 && this.terms.size > 0) {
        throw new Error("Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)");
      }
      if (this.terms.size === 0) {
        return operand.mul(this.constant);
      }
      let result = new QuadExpr();
      result.constant = this.constant * operand.constant;
      if (operand.constant !== 0) {
        for (const [v, c] of this.terms) {
          result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * operand.constant);
        }
      }
      if (this.constant !== 0) {
        for (const [v, c] of operand.linearTerms) {
          result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * this.constant);
        }
      }
      for (const [v1, c1] of this.terms) {
        for (const [v2, c2] of operand.linearTerms) {
          result = result.add(QuadExpr.fromProduct(v1, v2, c1 * c2));
        }
      }
      return result;
    }
    // operand is LinExpr
    if (this.terms.size === 0) {
      return operand.mul(this.constant);
    }
    if (operand.terms.size === 0) {
      return this.mul(operand.constant);
    }
    let result = new QuadExpr();
    result.constant = this.constant * operand.constant;
    if (operand.constant !== 0) {
      for (const [v, c] of this.terms) {
        result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * operand.constant);
      }
    }
    if (this.constant !== 0) {
      for (const [v, c] of operand.terms) {
        result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * this.constant);
      }
    }
    for (const [v1, c1] of this.terms) {
      for (const [v2, c2] of operand.terms) {
        result = result.add(QuadExpr.fromProduct(v1, v2, c1 * c2));
      }
    }
    return result;
  }

  /**
   * Divide this expression by a non-zero scalar
   */
  div(scalar: number): LinExpr {
    if (scalar === 0) {
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

  function isVar(x: any): x is Var {
    return (
      x !== null &&
      typeof x === "object" &&
      typeof x.id === "number" &&
      typeof x.name === "string" &&
      typeof x.mul === "function" &&
      typeof x.le === "function"
    );
  }

  function isExprOrVar(x: any): boolean {
    return isVar(x) || x instanceof LinExpr || x instanceof QuadExpr;
  }

  function addProduct(coeff: number, exprOrVar: Var | LinExpr | number) {
    if (typeof exprOrVar === "number") {
      constant += coeff * exprOrVar;
    } else if (exprOrVar instanceof LinExpr) {
      for (const [v, c] of exprOrVar.terms) {
        const cur = terms.get(v) || 0;
        terms.set(v, cur + coeff * c);
      }
      constant += coeff * exprOrVar.constant;
    } else if (isVar(exprOrVar)) {
      const v = exprOrVar as Var;
      const cur = terms.get(v) || 0;
      terms.set(v, cur + coeff);
    } else {
      throw new Error("Cannot multiply number by non-variable/expression operand in dot().");
    }
  }

  function isPlainRecord(obj: any): boolean {
    return (
      typeof obj === "object" &&
      obj !== null &&
      !Array.isArray(obj) &&
      !isExprOrVar(obj)
    );
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
      if (Array.isArray(valA) && Array.isArray(valB)) {
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

      const arr = Array.isArray(valA) ? valA : valB;
      const other = Array.isArray(valA) ? valB : valA;

      if (isPlainRecord(other)) {
        const keys = Object.keys(other);
        const allNumeric = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));

        if (allNumeric) {
          if (keys.length !== arr.length) {
            throw new Error(
              `Array length mismatch in dot() at '${path || "root"}': array has length ${arr.length}, but object has ${keys.length} indices.`
            );
          }
          const missingIndices: number[] = [];
          for (let i = 0; i < arr.length; i++) {
            if (!(i in other) && !(String(i) in other)) {
              missingIndices.push(i);
            }
          }
          if (missingIndices.length > 0) {
            throw new Error(
              `Key mismatch in dot() at '${path || "root"}': missing indices [${missingIndices.join(", ")}] in numeric record.`
            );
          }
          for (let i = 0; i < arr.length; i++) {
            const itemA = Array.isArray(valA) ? valA[i] : (valA as any)[i];
            const itemB = Array.isArray(valB) ? valB[i] : (valB as any)[i];
            recurse(itemA, itemB, path ? `${path}[${i}]` : `[${i}]`);
          }
          return;
        }

        throw new Error(
          `Type mismatch in dot() at '${path || "root"}': one operand is an Array while the other is an Object with keys [${keys.slice(0, 5).join(", ")}].`
        );
      }

      throw new Error(
        `Type mismatch in dot() at '${path || "root"}': one operand is an Array while the other is not.`
      );
    }

    if (isPlainRecord(valA) && isPlainRecord(valB)) {
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


