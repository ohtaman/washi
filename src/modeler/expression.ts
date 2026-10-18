import { Var } from "./variable.js";
import { Constraint, isConstraint } from "./constraint.js";
import { QuadExpr } from "./quad-expr.js";

/**
 * Represents a linear expression: c0 + c1*x1 + c2*x2 + ...
 */
export class LinExpr {
  public readonly kind = "linear" as const;
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
  add(other: QuadExpr | LinExpr | Var | number | Constraint): LinExpr | QuadExpr;
  add(other: QuadExpr | LinExpr | Var | number | Constraint): LinExpr | QuadExpr {
    if (isConstraint(other)) {
      throw new Error(
        "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
      );
    }
    if (other instanceof QuadExpr) {
      return other.add(this);
    }
    const result = this.clone();
    if (typeof other === "number") {
      result.constant += other;
    } else if ("terms" in other) {
      // other is LinExpr
      for (const [v, c] of other.terms) {
        const current = result.terms.get(v) ?? 0;
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
      const current = result.terms.get(other) ?? 0;
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
  sub(other: QuadExpr | LinExpr | Var | number | Constraint): LinExpr | QuadExpr;
  sub(other: QuadExpr | LinExpr | Var | number | Constraint): LinExpr | QuadExpr {
    if (isConstraint(other)) {
      throw new Error(
        "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
      );
    }
    if (other instanceof QuadExpr) {
      return other.neg().add(this);
    }
    if (typeof other === "number") {
      return this.add(-other);
    }
    return this.add(other.mul(-1));
  }

  /**
   * Multiply this expression by a scalar coefficient, variable, or expression
   */
  mul(scalar: number): LinExpr;
  mul(v: Var): QuadExpr;
  mul(other: LinExpr): LinExpr | QuadExpr;
  mul(other: QuadExpr): QuadExpr;
  mul(operand: number | Var | LinExpr | QuadExpr | Constraint): LinExpr | QuadExpr;
  mul(operand: number | Var | LinExpr | QuadExpr | Constraint): LinExpr | QuadExpr {
    if (isConstraint(operand)) {
      throw new Error(
        "Cannot perform arithmetic on a Constraint: expected a number, Var, LinExpr, or QuadExpr."
      );
    }
    if (typeof operand === "number") {
      const rawConst =
        this.constant === 0 && this.terms.size > 0 ? 0 : this.constant * operand;
      if (this.constant !== 0 && operand !== 0 && rawConst === 0) {
        throw new Error("Constant multiplication underflows to zero.");
      }
      const result = new LinExpr(new Map(), rawConst);
      for (const [v, c] of this.terms) {
        const prod = c * operand;
        if (c !== 0 && operand !== 0 && prod === 0) {
          throw new Error("Coefficient multiplication underflows to zero.");
        }
        if (prod !== 0) {
          result.terms.set(v, prod);
        }
      }
      return result;
    }
    const isVar =
      operand instanceof Var ||
      (typeof operand === "object" &&
        operand !== null &&
        "id" in operand &&
        !("terms" in operand) &&
        !("quadTerms" in operand));
    if (isVar) {
      return QuadExpr.multiplyLinearTerms(
        this.constant,
        this.terms,
        0,
        new Map([[operand as Var, 1]])
      );
    }
    if (operand instanceof QuadExpr) {
      if (this.terms.size === 0) {
        return operand.mul(this.constant);
      }
      return new QuadExpr(this.terms, new Map(), this.constant).mul(operand);
    }
    // operand is LinExpr
    if (this.terms.size === 0) {
      return operand.mul(this.constant);
    }
    if (operand.terms.size === 0) {
      return this.mul(operand.constant);
    }
    return QuadExpr.multiplyLinearTerms(
      this.constant,
      this.terms,
      operand.constant,
      operand.terms
    );
  }

  /**
   * Divide this expression by a non-zero scalar or constant-only expression
   */
  div(divisor: number | LinExpr | QuadExpr | Constraint): LinExpr {
    const scalar = QuadExpr.extractScalarDivisor(divisor, "LinExpr.div()");
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
   * Create constraint: this <= rhs
   */
  le(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toConstraint("<=", rhs, name);
  }

  /**
   * Create constraint: this >= rhs
   */
  ge(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toConstraint(">=", rhs, name);
  }

  /**
   * Create constraint: this == rhs
   */
  eq(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toConstraint("==", rhs, name);
  }

  private toConstraint(
    sense: "<=" | ">=" | "==",
    rhs: number | Var | LinExpr | QuadExpr | Constraint,
    name?: string
  ): Constraint {
    // Normalization: lhs terms on left, constant on right:
    // this - rhs_terms <= rhs_constant - this.constant
    let target = this.clone();
    let rhsConstant = 0;

    if (typeof rhs === "number") {
      rhsConstant = rhs;
    } else if (
      rhs instanceof Constraint ||
      (typeof rhs === "object" && rhs !== null && "sense" in rhs && "lhs" in rhs)
    ) {
      throw new Error(
        `Cannot compare against a Constraint in (${sense}): expected a number, Var, or LinExpr.`
      );
    } else if (
      rhs instanceof QuadExpr ||
      (typeof rhs === "object" && rhs !== null && "quadTerms" in rhs)
    ) {
      const quad = rhs as QuadExpr;
      if (quad.quadTerms.size > 0) {
        throw new Error(
          `Quadratic expressions are not supported in linear constraints (${sense}): quadratic terms are only allowed in objectives.`
        );
      }
      target = target.sub(new LinExpr(quad.linearTerms, 0));
      rhsConstant = quad.constant;
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

  // Runtime guards when an arithmetic expression from unified expr`...` is chained with logical combinators
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
 * Sum an `Iterable` of `Var` / `LinExpr` / `number` items, an `Iterable` with a mapping function,
 * or a numeric count `n` with an index mapper `(0 .. n - 1)` into a single `LinExpr`.
 *
 * **Formulation notes**:
 * - Produces a linear expression (`LinExpr`).
 * - Passing comparison `Constraint`s (`<=`, `>=`, `==`) or non-linear `QuadExpr` terms throws an Error
 *   (quadratic terms are supported in objectives only via `expr` or `.mul()`).
 *
 * @example
 * ```ts
 * const m = new Model("SumExample");
 * const x = m.continuous(3, { lb: 0, prefix: "x" });
 * const byItem = m.integer(["desk", "chair"] as const, { lb: 0 });
 *
 * // Sum an array or iterable directly
 * m.constraint(expr`${sum(x)} <= 100`, "total_x");
 * m.constraint(expr`${sum(Object.values(byItem))} <= 50`, "total_items");
 *
 * // Sum with a mapper or over a count range (0..2)
 * const weighted = sum(3, (i) => expr`${i + 1} * ${x[i]}`);
 * m.objective(maximize(weighted));
 * ```
 */
export function sum(
  count: number,
  mapFn: (index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function sum<T = any>(
  items: Iterable<T>,
  mapFn?: (item: T, index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function sum<T = any>(
  arg1: number | Iterable<T>,
  arg2?: (item: any, index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr {
  const terms = new Map<Var, number>();
  let constant = 0;

  function addVal(val: LinExpr | QuadExpr | Constraint | Var | number | undefined | null) {
    if (val === null || val === undefined) return;
    if (typeof val === "number") {
      constant += val;
    } else if (
      val instanceof Constraint ||
      (typeof val === "object" && "sense" in val && "lhs" in val && "rhs" in val)
    ) {
      throw new Error(
        "Cannot sum a constraint comparison (<=, >=, ==) in sum(): expected a number, Var, or LinExpr."
      );
    } else if (
      val instanceof QuadExpr ||
      (typeof val === "object" && "quadTerms" in val && val.quadTerms instanceof Map)
    ) {
      const quadExpr = val as QuadExpr;
      if (quadExpr.quadTerms.size > 0) {
        throw new Error(
          "Quadratic expressions are not supported in sum(): sum() produces a linear expression (LinExpr)."
        );
      }
      for (const [v, c] of quadExpr.linearTerms) {
        const cur = terms.get(v) ?? 0;
        terms.set(v, cur + c);
      }
      constant += quadExpr.constant;
    } else if (typeof val === "object" && "terms" in val) {
      const linExpr = val as LinExpr;
      for (const [v, c] of linExpr.terms) {
        const cur = terms.get(v) ?? 0;
        terms.set(v, cur + c);
      }
      constant += linExpr.constant;
    } else if (typeof val === "object" && "id" in val && "name" in val && "lb" in val && "ub" in val) {
      const v = val as Var;
      const cur = terms.get(v) ?? 0;
      terms.set(v, cur + 1);
    } else {
      throw new Error("Unsupported item in sum(): expected a number, Var, or LinExpr.");
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

  // Prune exact zero terms
  for (const [v, c] of terms) {
    if (c === 0) {
      terms.delete(v);
    }
  }

  return new LinExpr(terms, constant);
}

export type DotTerm = Var | LinExpr;

export type DotVarContainer<
  R extends string | number = string | number,
  C extends string | number = string | number,
> =
  | ReadonlyArray<DotTerm>
  | { readonly [K in R]: DotTerm }
  | ReadonlyArray<ReadonlyArray<DotTerm>>
  | ReadonlyArray<{ readonly [K in C]: DotTerm }>
  | { readonly [K in R]: ReadonlyArray<DotTerm> }
  | { readonly [K in R]: { readonly [L in C]: DotTerm } };

export type DotCoeffContainer<
  R extends string | number = string | number,
  C extends string | number = string | number,
> =
  | ReadonlyArray<number>
  | { readonly [K in R]: number }
  | ReadonlyArray<ReadonlyArray<number>>
  | ReadonlyArray<{ readonly [K in C]: number }>
  | { readonly [K in R]: ReadonlyArray<number> }
  | { readonly [K in R]: { readonly [L in C]: number } };

type NoSymbolKeys<T> = {
  readonly [Symbol.iterator]?: never;
} & (
  | { readonly [s: symbol]: never }
  | { readonly [S in Extract<keyof T, symbol>]?: never }
);

type DotRecordLeafMap<T, Leaf> = object & {
  readonly [K in keyof T]: Leaf;
} & NoSymbolKeys<T>;

type DotRecordShape<T, Leaf, Inner = never> = object & {
  readonly [K in keyof T]:
    | Leaf
    | ReadonlyArray<Leaf>
    | DotRecordLeafMap<T[K], Leaf>
    | DotRecordLeafMap<Inner, Leaf>;
} & NoSymbolKeys<T>;

type DotContainerArg<T, Leaf, Inner = never> =
  | ReadonlyArray<Leaf>
  | ReadonlyArray<ReadonlyArray<Leaf>>
  | ReadonlyArray<DotRecordLeafMap<T[number & keyof T], Leaf>>
  | DotRecordShape<T, Leaf, Inner>;

/**
 * Compute the inner product (linear combination `LinExpr`) of numeric coefficients and
 * `Var` / `LinExpr` containers across 1D arrays, 2D matrices (`number[][]` / `Var[][]`),
 * plain records (`Record<K, ...>`), and mixed Array/Record containers in either operand order:
 * - `dot(coeffs, vars)` or `dot(vars, coeffs)`
 * - `dot(costMatrix, flowMatrix)`
 *
 * **Formulation notes**:
 * - Produces a linear expression (`LinExpr`) and validates matching array lengths / record keys and finite coefficients.
 * - Does not accept arbitrary `Iterable`s (use `sum()` for general iterables) or non-linear `QuadExpr` / `Constraint` operands
 *   (quadratic variable-by-variable terms are supported in objectives only via `expr` or `.mul()`).
 *
 * @example
 * ```ts
 * const m = new Model("DotExample");
 * const vec = m.continuous(3, { lb: 0, prefix: "v" });
 * const qty = m.integer(["desk", "chair"] as const, { lb: 0 });
 * const grid = m.binary(2, 2, { prefix: "g" });
 *
 * // 1D array, Record, and 2D matrix inner products
 * m.constraint(expr`${dot([2, 4, 6], vec)} <= 60`, "vec_limit");
 * m.constraint(expr`${dot({ desk: 1, chair: 2 }, qty)} <= 40`, "wood_cap");
 * m.objective(
 *   maximize(
 *     expr`${dot({ desk: 30, chair: 50 }, qty)} - ${dot(
 *       [
 *         [5, 8],
 *         [3, 6],
 *       ],
 *       grid
 *     )}`
 *   )
 * );
 * ```
 */
export function dot<
  C = DotCoeffContainer,
  V = DotVarContainer,
  CI = never,
  VI = never,
>(
  coeffs: C & (Record<any, CI> | unknown) & DotContainerArg<C, number, CI>,
  vars: V & (Record<any, VI> | unknown) & DotContainerArg<V, DotTerm, VI>
): LinExpr;
export function dot<
  V = DotVarContainer,
  C = DotCoeffContainer,
  VI = never,
  CI = never,
>(
  vars: V & (Record<any, VI> | unknown) & DotContainerArg<V, DotTerm, VI>,
  coeffs: C & (Record<any, CI> | unknown) & DotContainerArg<C, number, CI>
): LinExpr;
export function dot(
  coeffs: DotCoeffContainer<any, any>,
  vars: DotVarContainer<any, any>
): LinExpr;
export function dot(
  vars: DotVarContainer<any, any>,
  coeffs: DotCoeffContainer<any, any>
): LinExpr;
export function dot(a: any, b: any): LinExpr {
  const terms = new Map<Var, number>();
  let constant = 0;

  function isVar(x: any): x is Var {
    return (
      x !== null &&
      typeof x === "object" &&
      !(x instanceof Constraint) &&
      typeof x.id === "number" &&
      typeof x.name === "string" &&
      typeof x.lb === "number" &&
      typeof x.ub === "number" &&
      typeof x.type === "string" &&
      typeof x.mul === "function" &&
      typeof x.le === "function"
    );
  }

  function isExprOrVar(x: any): boolean {
    return isVar(x) || x instanceof LinExpr || x instanceof QuadExpr;
  }

  function addProduct(coeff: number, exprOrVar: unknown, path: string) {
    if (!Number.isFinite(coeff)) {
      throw new Error(
        `Invalid non-finite coefficient "${coeff}" in dot() at '${path || "root"}'.`
      );
    }
    if (exprOrVar instanceof QuadExpr) {
      throw new Error(
        `Quadratic expressions are not supported in dot() at '${path || "root"}': dot() produces a linear expression (LinExpr).`
      );
    }
    if (exprOrVar instanceof LinExpr) {
      if (!Number.isFinite(exprOrVar.constant)) {
        throw new Error(
          `Invalid non-finite constant "${exprOrVar.constant}" in dot() at '${path || "root"}'.`
        );
      }
      const rawConst =
        coeff === 0 || exprOrVar.constant === 0 ? 0 : coeff * exprOrVar.constant;
      if (coeff !== 0 && exprOrVar.constant !== 0 && rawConst === 0) {
        throw new Error("Constant multiplication underflows to zero.");
      }
      if (!Number.isFinite(rawConst)) {
        throw new Error(
          `Coefficient multiplication overflows finite floating-point range in dot() at '${path || "root"}'.`
        );
      }
      const nextConst = constant + rawConst;
      if (!Number.isFinite(nextConst)) {
        throw new Error(
          `Constant accumulation overflows finite floating-point range in dot() at '${path || "root"}'.`
        );
      }
      constant = nextConst;
      for (const [v, c] of exprOrVar.terms) {
        if (!Number.isFinite(c)) {
          throw new Error(
            `Invalid non-finite coefficient "${c}" in dot() at '${path || "root"}'.`
          );
        }
        const prod = coeff * c;
        if (coeff !== 0 && c !== 0 && prod === 0) {
          throw new Error("Coefficient multiplication underflows to zero.");
        }
        if (!Number.isFinite(prod)) {
          throw new Error(
            `Coefficient multiplication overflows finite floating-point range in dot() at '${path || "root"}'.`
          );
        }
        const cur = terms.get(v) ?? 0;
        const next = cur + prod;
        if (!Number.isFinite(next)) {
          throw new Error(
            `Coefficient accumulation overflows finite floating-point range in dot() at '${path || "root"}'.`
          );
        }
        terms.set(v, next);
      }
    } else if (isVar(exprOrVar)) {
      const v = exprOrVar as Var;
      const cur = terms.get(v) ?? 0;
      const next = cur + coeff;
      if (!Number.isFinite(next)) {
        throw new Error(
          `Coefficient accumulation overflows finite floating-point range in dot() at '${path || "root"}'.`
        );
      }
      terms.set(v, next);
    } else {
      throw new Error(
        `Cannot multiply number by non-variable/expression operand in dot() at '${path || "root"}'.`
      );
    }
  }

  function isPlainRecord(obj: any): boolean {
    return (
      typeof obj === "object" &&
      obj !== null &&
      !Array.isArray(obj) &&
      !isExprOrVar(obj) &&
      !(obj instanceof Constraint) &&
      obj.kind !== "constraint"
    );
  }

  function recurse(valA: any, valB: any, path: string = "") {
    if (valA === undefined || valB === undefined || valA === null || valB === null) {
      throw new Error(`Nullish or undefined operand encountered in dot() at '${path || "root"}'.`);
    }

    if (typeof valA === "number" && typeof valB === "number") {
      throw new Error(
        `Cannot multiply two numbers in dot() at '${path || "root"}': expected one numeric coefficient and one Var or LinExpr.`
      );
    }
    if (typeof valA === "number") {
      addProduct(valA, valB, path);
      return;
    }
    if (typeof valB === "number") {
      addProduct(valB, valA, path);
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
        if (Object.getOwnPropertySymbols(other).length > 0) {
          throw new Error(
            `Symbol keys are not supported in dot() at '${path || "root"}'.`
          );
        }
        const keys = Object.keys(other);
        const allNumeric =
          keys.length === arr.length &&
          keys.every((k) => /^(?:0|[1-9]\d*)$/.test(k));

        if (allNumeric) {
          const missingIndices: number[] = [];
          for (let i = 0; i < arr.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(other, i)) {
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

        if (keys.length > 0 && keys.every((k) => /^(?:0|[1-9]\d*)$/.test(k))) {
          throw new Error(
            `Array length mismatch in dot() at '${path || "root"}': array has length ${arr.length}, but object has ${keys.length} indices.`
          );
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
      if (
        Object.getOwnPropertySymbols(valA).length > 0 ||
        Object.getOwnPropertySymbols(valB).length > 0
      ) {
        throw new Error(
          `Symbol keys are not supported in dot() at '${path || "root"}'.`
        );
      }
      const keysA = Object.keys(valA);
      const keysB = Object.keys(valB);

      const missingInB = keysA.filter((k) => !Object.prototype.hasOwnProperty.call(valB, k));
      const missingInA = keysB.filter((k) => !Object.prototype.hasOwnProperty.call(valA, k));

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
    if (c === 0) {
      terms.delete(v);
    }
  }

  return new LinExpr(terms, constant);
}


