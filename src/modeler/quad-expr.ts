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
        const sumCoeff = (current ? current.coeff : 0) + term.coeff;
        if (Math.abs(sumCoeff) < 1e-12) {
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
        if (Math.abs(sumCoeff) < 1e-12) {
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
        if (Math.abs(sumCoeff) < 1e-12) {
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
    if (Math.abs(sumCoeff) < 1e-12) {
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
   * Multiply by a scalar coefficient
   */
  mul(scalar: number): QuadExpr {
    const result = new QuadExpr(new Map(), new Map(), this.constant * scalar);
    for (const [v, c] of this.linearTerms) {
      const prod = c * scalar;
      if (Math.abs(prod) >= 1e-12) {
        result.linearTerms.set(v, prod);
      }
    }
    for (const [k, term] of this.quadTerms) {
      const prod = term.coeff * scalar;
      if (Math.abs(prod) >= 1e-12) {
        result.quadTerms.set(k, {
          var1: term.var1,
          var2: term.var2,
          coeff: prod,
        });
      }
    }
    return result;
  }

  /**
   * Divide by a non-zero scalar
   */
  div(scalar: number): QuadExpr {
    if (Math.abs(scalar) < 1e-12) {
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
