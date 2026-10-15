import type { Var } from "./variable.js";
import type { LinExpr } from "./expression.js";

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

/**
 * Represents a quadratic expression:
 * constant + sum(c_i * x_i) + sum(q_ij * x_i * x_j)
 */
export class QuadExpr {
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
  add(other: QuadExpr | LinExpr | Var | number): QuadExpr {
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
        const current = result.linearTerms.get(v) || 0;
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
        const current = result.linearTerms.get(v) || 0;
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
    const current = result.linearTerms.get(v) || 0;
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
  sub(other: QuadExpr | LinExpr | Var | number): QuadExpr {
    if (typeof other === "number") {
      return this.add(-other);
    }
    if (other instanceof QuadExpr) {
      return this.add(other.neg());
    }
    if ("terms" in other && other.terms instanceof Map) {
      return this.add(other.mul(-1));
    }
    return this.add(other.mul(-1));
  }

  /**
   * Multiply by a scalar coefficient, variable, or linear/quadratic expression
   */
  mul(scalar: number): QuadExpr;
  mul(other: Var | LinExpr | QuadExpr): QuadExpr;
  mul(operand: number | Var | LinExpr | QuadExpr): QuadExpr {
    if (typeof operand === "number") {
      const rawConst = this.constant * operand;
      const result = new QuadExpr(
        new Map(),
        new Map(),
        rawConst === 0 ? 0 : rawConst
      );
      for (const [v, c] of this.linearTerms) {
        const prod = c * operand;
        if (prod !== 0) {
          result.linearTerms.set(v, prod);
        }
      }
      for (const [k, term] of this.quadTerms) {
        const prod = term.coeff * operand;
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

    // Check if operand is Var (has id and name, but not terms)
    if ("id" in operand && "name" in operand && !("terms" in operand) && !("quadTerms" in operand)) {
      if (this.quadTerms.size > 0) {
        throw new Error("Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)");
      }
      let result = new QuadExpr();
      if (this.constant !== 0) {
        result.linearTerms.set(operand as Var, this.constant);
      }
      for (const [v, c] of this.linearTerms) {
        result = result.add(QuadExpr.fromProduct(v, operand as Var, c));
      }
      return result;
    }

    const otherExpr = operand as LinExpr | QuadExpr;
    const otherQuadSize = "quadTerms" in otherExpr ? otherExpr.quadTerms.size : 0;
    const otherLinTerms = "quadTerms" in otherExpr ? otherExpr.linearTerms : otherExpr.terms;

    if (this.quadTerms.size > 0 && (otherQuadSize > 0 || otherLinTerms.size > 0)) {
      throw new Error("Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)");
    }
    if (otherQuadSize > 0 && this.linearTerms.size > 0) {
      throw new Error("Multiplication creates a non-linear term of degree > 2 (not allowed in MILP/LP/QP)");
    }

    if (otherQuadSize === 0 && otherLinTerms.size === 0) {
      return this.mul(otherExpr.constant);
    }
    if (this.quadTerms.size === 0 && this.linearTerms.size === 0) {
      const mulResult = otherExpr.mul(this.constant);
      if (mulResult instanceof QuadExpr) {
        return mulResult;
      }
      const result = new QuadExpr();
      result.constant = mulResult.constant;
      for (const [v, c] of mulResult.terms) {
        result.linearTerms.set(v, c);
      }
      return result;
    }

    // Both are linear (degree 1)
    let result = new QuadExpr();
    result.constant = this.constant * otherExpr.constant;
    if (otherExpr.constant !== 0) {
      for (const [v, c] of this.linearTerms) {
        result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * otherExpr.constant);
      }
    }
    if (this.constant !== 0) {
      for (const [v, c] of otherLinTerms) {
        result.linearTerms.set(v, (result.linearTerms.get(v) || 0) + c * this.constant);
      }
    }
    for (const [v1, c1] of this.linearTerms) {
      for (const [v2, c2] of otherLinTerms) {
        result = result.add(QuadExpr.fromProduct(v1, v2, c1 * c2));
      }
    }
    return result;
  }

  /**
   * Divide by a non-zero scalar
   */
  div(scalar: number): QuadExpr {
    if (scalar === 0) {
      throw new Error("Division by zero in QuadExpr.div()");
    }
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
    const key = makeQuadKey(v1, v2);
    expr.quadTerms.set(key, {
      var1: v1.id <= v2.id ? v1 : v2,
      var2: v1.id <= v2.id ? v2 : v1,
      coeff,
    });
    return expr;
  }
}
