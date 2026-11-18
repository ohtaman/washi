import { Var } from "./variable.js";
import { Constraint, isConstraint } from "./constraint.js";
import { QuadExpr } from "./quad-expr.js";

/**
 * Nonlinear scalar atom representable inside a `LinExpr` (piecewise-linear `max`/`min`/`abs` or `at` element lookup).
 */
export type NonlinearAtom =
  | { readonly kind: "max"; readonly args: ReadonlyArray<LinExpr> }
  | { readonly kind: "min"; readonly args: ReadonlyArray<LinExpr> }
  | { readonly kind: "abs"; readonly arg: LinExpr }
  | {
      readonly kind: "at";
      readonly array: ReadonlyArray<LinExpr>;
      readonly index: LinExpr;
      readonly discreteVars: ReadonlySet<Var>;
    };

/**
 * Weighted nonlinear scalar atom term (`coeff * atom`).
 */
export interface NonlinearTerm {
  readonly atom: NonlinearAtom;
  readonly coeff: number;
}

export function cloneNonlinearAtom(atom: NonlinearAtom): NonlinearAtom {
  switch (atom.kind) {
    case "abs":
      return { kind: "abs", arg: atom.arg.clone() };
    case "max":
      return { kind: "max", args: atom.args.map((a) => a.clone()) };
    case "min":
      return { kind: "min", args: atom.args.map((a) => a.clone()) };
    case "at":
      return {
        kind: "at",
        array: atom.array.map((a) => a.clone()),
        index: atom.index.clone(),
        discreteVars: new Set(atom.discreteVars),
      };
  }
}

function formatNonlinearAtom(atom: NonlinearAtom): string {
  switch (atom.kind) {
    case "abs":
      return `abs(${atom.arg.toString()})`;
    case "max":
      return `max(${atom.args.map((a) => a.toString()).join(", ")})`;
    case "min":
      return `min(${atom.args.map((a) => a.toString()).join(", ")})`;
    case "at":
      return `at([${atom.array.map((a) => a.toString()).join(", ")}], ${atom.index.toString()})`;
  }
}

export function evaluateNonlinearAtomValue(atom: NonlinearAtom): number | null {
  switch (atom.kind) {
    case "abs": {
      const val = atom.arg.value;
      return val === null ? null : Math.abs(val);
    }
    case "max": {
      let best = -Infinity;
      for (const a of atom.args) {
        const val = a.value;
        if (val === null) return null;
        if (val > best) best = val;
      }
      return best;
    }
    case "min": {
      let best = Infinity;
      for (const a of atom.args) {
        const val = a.value;
        if (val === null) return null;
        if (val < best) best = val;
      }
      return best;
    }
    case "at": {
      const idxVal = atom.index.value;
      if (idxVal === null || !Number.isFinite(idxVal)) return null;
      const rounded = Math.round(idxVal);
      if (Math.abs(idxVal - rounded) > 1e-6) return null;
      if (rounded < 0 || rounded >= atom.array.length) return null;
      return atom.array[rounded].value;
    }
  }
}

function isVarLikeExpr(val: unknown): val is Var {
  return (
    val instanceof Var ||
    (typeof val === "object" &&
      val !== null &&
      !isConstraint(val) &&
      typeof (val as { id?: unknown }).id === "number" &&
      typeof (val as { name?: unknown }).name === "string" &&
      typeof (val as { lb?: unknown }).lb === "number" &&
      typeof (val as { ub?: unknown }).ub === "number" &&
      typeof (val as { type?: unknown }).type === "string" &&
      typeof (val as { mul?: unknown }).mul === "function")
  );
}

/**
 * Validates that an expression is purely integer-valued (only Integer/Binary variables,
 * safe integer coefficients/constants, and discrete nested atoms) and collects all referenced `Var`s.
 */
export function collectAndValidateDiscreteExpr(
  val: LinExpr | QuadExpr | Var | number,
  context: string,
  outVars: Set<Var> = new Set<Var>()
): Set<Var> {
  if (typeof val === "number") {
    if (!Number.isSafeInteger(val)) {
      throw new Error(
        `${context} requires Integer or Binary variables and integer constants/coefficients, but received constant ${val}.`
      );
    }
    return outVars;
  }
  if (isConstraint(val)) {
    throw new Error(`${context} cannot accept a Constraint comparison.`);
  }
  if (
    val instanceof QuadExpr ||
    ("quadTerms" in val &&
      (val as { quadTerms?: unknown }).quadTerms instanceof Map &&
      "linearTerms" in val &&
      (val as { linearTerms?: unknown }).linearTerms instanceof Map &&
      typeof (val as { constant?: unknown }).constant === "number")
  ) {
    const q = val as Pick<QuadExpr, "quadTerms" | "linearTerms" | "constant" | "nonlinearTerms">;
    if (q.quadTerms.size > 0) {
      throw new Error(`${context} does not support quadratic expressions.`);
    }
    return collectAndValidateDiscreteExpr(
      new LinExpr(q.linearTerms, q.constant, q.nonlinearTerms ?? []),
      context,
      outVars
    );
  }
  if (isVarLikeExpr(val)) {
    if (val.type !== "Integer" && val.type !== "Binary") {
      throw new Error(
        `${context} requires Integer or Binary variables, but involves Continuous variable "${val.name}".`
      );
    }
    outVars.add(val);
    return outVars;
  }
  if ("terms" in val && (val as LinExpr).terms instanceof Map) {
    const lin = val as LinExpr;
    const c = lin.constant ?? 0;
    if (!Number.isSafeInteger(c)) {
      throw new Error(
        `${context} requires Integer or Binary variables and integer constants/coefficients, but received constant ${c}.`
      );
    }
    for (const [v, coeff] of lin.terms) {
      if (coeff === 0) continue;
      if (v.type !== "Integer" && v.type !== "Binary") {
        throw new Error(
          `${context} requires Integer or Binary variables, but involves Continuous variable "${v.name}".`
        );
      }
      if (!Number.isSafeInteger(coeff)) {
        throw new Error(
          `${context} requires integer coefficients, but variable "${v.name}" has coefficient ${coeff}.`
        );
      }
      outVars.add(v);
    }
    for (const nl of lin.nonlinearTerms ?? []) {
      if (nl.coeff === 0) continue;
      if (!Number.isSafeInteger(nl.coeff)) {
        throw new Error(
          `${context} requires integer coefficients on nonlinear expressions, received ${nl.coeff}.`
        );
      }
      const atom = nl.atom;
      if (atom.kind === "abs") {
        collectAndValidateDiscreteExpr(atom.arg, context, outVars);
      } else if (atom.kind === "max" || atom.kind === "min") {
        for (const arg of atom.args) {
          collectAndValidateDiscreteExpr(arg, context, outVars);
        }
      } else if (atom.kind === "at") {
        collectAndValidateDiscreteExpr(atom.index, context, outVars);
        for (const elem of atom.array) {
          collectAndValidateDiscreteExpr(elem, context, outVars);
        }
      }
    }
    return outVars;
  }
  throw new Error(`${context} expected an integer-valued scalar expression.`);
}

/**
 * Converts a scalar `number | Var | LinExpr | degree-1 QuadExpr` to a cloned `LinExpr`,
 * rejecting `Constraint`, non-finite numbers, and quadratic terms.
 */
export function toScalarLinExpr(val: unknown, context: string): LinExpr {
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new Error(`Invalid non-finite number "${val}" in ${context}.`);
    }
    return new LinExpr(new Map(), Object.is(val, -0) ? 0 : val);
  }
  if (isConstraint(val)) {
    if (context.startsWith("sum")) {
      throw new Error(
        `Cannot sum a constraint comparison (<=, >=, ==, !=, <, >): expected arithmetic expressions in ${context}.`
      );
    }
    throw new Error(
      `Cannot use a constraint comparison (<=, >=, ==, !=, <, >) in ${context}: expected a finite number, Var, or LinExpr.`
    );
  }
  if (
    val instanceof QuadExpr ||
    (typeof val === "object" &&
      val !== null &&
      "quadTerms" in val &&
      (val as { quadTerms: unknown }).quadTerms instanceof Map &&
      "linearTerms" in val &&
      (val as { linearTerms: unknown }).linearTerms instanceof Map)
  ) {
    const q = val as QuadExpr;
    if (q.quadTerms.size > 0) {
      throw new Error(`Quadratic expressions are not supported in ${context}.`);
    }
    if (!Number.isFinite(q.constant)) {
      throw new Error(`Invalid non-finite constant "${q.constant}" in ${context}.`);
    }
    for (const [, coeff] of q.linearTerms) {
      if (!Number.isFinite(coeff)) {
        throw new Error(`Invalid non-finite coefficient "${coeff}" in ${context}.`);
      }
    }
    return new LinExpr(q.linearTerms, q.constant, q.nonlinearTerms ?? []);
  }
  if (
    val instanceof LinExpr ||
    (typeof val === "object" &&
      val !== null &&
      "terms" in val &&
      (val as { terms: unknown }).terms instanceof Map &&
      typeof (val as { constant?: unknown }).constant === "number")
  ) {
    const lin = val as LinExpr;
    if (!Number.isFinite(lin.constant)) {
      throw new Error(`Invalid non-finite constant "${lin.constant}" in ${context}.`);
    }
    for (const [, coeff] of lin.terms) {
      if (!Number.isFinite(coeff)) {
        throw new Error(`Invalid non-finite coefficient "${coeff}" in ${context}.`);
      }
    }
    return lin.clone();
  }
  if (isVarLikeExpr(val)) {
    return new LinExpr(new Map([[val, 1]]), 0);
  }
  throw new Error(`Unsupported item in ${context}: expected a finite number, Var, or LinExpr.`);
}

/**
 * Represents a linear (or piecewise-linear / element) expression: c0 + sum(c_i*x_i) + sum(w_k*atom_k)
 */
export class LinExpr {
  public readonly kind = "linear" as const;
  public terms: Map<Var, number>;
  public constant: number;
  public nonlinearTerms: NonlinearTerm[];

  constructor(
    terms: Map<Var, number> = new Map(),
    constant: number = 0,
    nonlinearTerms: ReadonlyArray<NonlinearTerm> = []
  ) {
    this.terms = new Map(terms);
    this.constant = constant;
    this.nonlinearTerms = nonlinearTerms
      .filter((t) => t.coeff !== 0)
      .map((t) => ({ atom: cloneNonlinearAtom(t.atom), coeff: t.coeff }));
  }

  /**
   * Returns true if this expression includes nonlinear scalar atoms (`max`, `min`, `abs`, `at`).
   */
  hasNonlinearTerms(): boolean {
    return this.nonlinearTerms.length > 0;
  }

  /**
   * Set or overwrite the coefficient for a variable in this expression.
   * If `coeff === 0`, removes the variable from terms.
   */
  setTerm(v: Var, coeff: number): this {
    if (coeff === 0) {
      this.terms.delete(v);
    } else {
      this.terms.set(v, coeff);
    }
    return this;
  }

  /**
   * Add a coefficient to a variable in this expression (incrementing any existing coefficient).
   * If the resulting coefficient is 0, removes the variable from terms.
   */
  addTerm(v: Var, coeff: number): this {
    const current = this.terms.get(v) ?? 0;
    const next = current + coeff;
    if (next === 0) {
      this.terms.delete(v);
    } else {
      this.terms.set(v, next);
    }
    return this;
  }

  /**
   * Clone this linear expression
   */
  clone(): LinExpr {
    return new LinExpr(this.terms, this.constant, this.nonlinearTerms);
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
      if (Array.isArray(other.nonlinearTerms)) {
        for (const t of other.nonlinearTerms) {
          if (t.coeff !== 0) {
            result.nonlinearTerms.push({ atom: cloneNonlinearAtom(t.atom), coeff: t.coeff });
          }
        }
      }
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
      const hasTerms = this.terms.size > 0 || this.nonlinearTerms.length > 0;
      const rawConst =
        this.constant === 0 && hasTerms ? 0 : this.constant * operand;
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
      if (operand !== 0) {
        for (const nl of this.nonlinearTerms) {
          const prod = nl.coeff * operand;
          if (nl.coeff !== 0 && prod === 0) {
            throw new Error("Coefficient multiplication underflows to zero.");
          }
          if (prod !== 0) {
            result.nonlinearTerms.push({ atom: cloneNonlinearAtom(nl.atom), coeff: prod });
          }
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
      if (this.hasNonlinearTerms()) {
        throw new Error(
          "Cannot multiply nonlinear expression (max, min, abs, or at) by a variable expression: only scalar multiplication is supported."
        );
      }
      return QuadExpr.multiplyLinearTerms(
        this.constant,
        this.terms,
        0,
        new Map([[operand as Var, 1]])
      );
    }
    if (operand instanceof QuadExpr) {
      const opHasTerms = operand.linearTerms.size > 0 || operand.quadTerms.size > 0 || operand.hasNonlinearTerms();
      if (this.hasNonlinearTerms()) {
        if (!opHasTerms) {
          return this.mul(operand.constant);
        }
        throw new Error(
          "Cannot multiply nonlinear expression (max, min, abs, or at) by a variable expression: only scalar multiplication is supported."
        );
      }
      if (operand.hasNonlinearTerms()) {
        if (this.terms.size === 0) {
          return operand.mul(this.constant);
        }
        throw new Error(
          "Cannot multiply nonlinear expression (max, min, abs, or at) by a variable expression: only scalar multiplication is supported."
        );
      }
      if (this.terms.size === 0) {
        return operand.mul(this.constant);
      }
      return new QuadExpr(this.terms, new Map(), this.constant).mul(operand);
    }
    // operand is LinExpr
    const opLinHasNl = Array.isArray(operand.nonlinearTerms) && operand.nonlinearTerms.length > 0;
    if (this.hasNonlinearTerms()) {
      if (operand.terms.size === 0 && !opLinHasNl) {
        return this.mul(operand.constant);
      }
      throw new Error(
        "Cannot multiply nonlinear expression (max, min, abs, or at) by a variable expression: only scalar multiplication is supported."
      );
    }
    if (opLinHasNl) {
      if (this.terms.size === 0) {
        return operand.mul(this.constant);
      }
      throw new Error(
        "Cannot multiply nonlinear expression (max, min, abs, or at) by a variable expression: only scalar multiplication is supported."
      );
    }
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
    for (const nl of this.nonlinearTerms) {
      const atomVal = evaluateNonlinearAtomValue(nl.atom);
      if (atomVal === null) {
        return null;
      }
      sum += nl.coeff * atomVal;
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

  /**
   * Create discrete strict less-than constraint (`this < rhs`, normalized to `this <= rhs - 1`).
   * Requires integer-valued `Integer`/`Binary` expressions; throws on `Continuous` variables or fractional constants.
   */
  lt(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toDiscreteComparison("<", rhs, name);
  }

  /**
   * Create discrete strict greater-than constraint (`this > rhs`, normalized to `this >= rhs + 1`).
   * Requires integer-valued `Integer`/`Binary` expressions; throws on `Continuous` variables or fractional constants.
   */
  gt(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toDiscreteComparison(">", rhs, name);
  }

  /**
   * Create discrete not-equal constraint (`this != rhs`).
   * Requires integer-valued `Integer`/`Binary` expressions; throws on `Continuous` variables or fractional constants.
   */
  ne(rhs: number | Var | LinExpr | QuadExpr | Constraint, name?: string): Constraint {
    return this.toDiscreteComparison("!=", rhs, name);
  }

  private toDiscreteComparison(
    op: "<" | ">" | "!=",
    rhs: number | Var | LinExpr | QuadExpr | Constraint,
    name?: string
  ): Constraint {
    if (
      rhs instanceof Constraint ||
      (typeof rhs === "object" && rhs !== null && "sense" in rhs && "lhs" in rhs)
    ) {
      throw new Error(
        `Cannot compare against a Constraint in (${op}): expected a finite integer, discrete Var, or discrete LinExpr.`
      );
    }
    const opLabel = `discrete ${op}`;
    const discreteVars = new Set<Var>();
    collectAndValidateDiscreteExpr(this, opLabel, discreteVars);
    collectAndValidateDiscreteExpr(rhs as any, opLabel, discreteVars);

    const c = this.toConstraint(op === "<" ? "<=" : op === ">" ? ">=" : "!=", rhs, name);
    if (op === "<") {
      const shifted = c.rhs - 1;
      if (!Number.isSafeInteger(shifted)) {
        throw new Error(
          `Discrete comparison (<) adjusted right-hand side (${shifted}) exceeds safe integer range.`
        );
      }
      c.rhs = shifted;
    } else if (op === ">") {
      const shifted = c.rhs + 1;
      if (!Number.isSafeInteger(shifted)) {
        throw new Error(
          `Discrete comparison (>) adjusted right-hand side (${shifted}) exceeds safe integer range.`
        );
      }
      c.rhs = shifted;
    } else {
      if (!Number.isSafeInteger(c.rhs)) {
        throw new Error(
          `Discrete comparison (!=) adjusted right-hand side (${c.rhs}) exceeds safe integer range.`
        );
      }
    }
    c._setDiscreteVars(discreteVars);
    return c;
  }

  private toConstraint(
    sense: "<=" | ">=" | "==" | "!=",
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
      target = target.sub(new LinExpr(quad.linearTerms, 0, quad.nonlinearTerms ?? []));
      rhsConstant = quad.constant;
    } else if ("terms" in rhs) {
      // rhs is LinExpr: subtract its terms and nonlinearTerms, and add its constant
      target = target.sub(new LinExpr(rhs.terms, 0, rhs.nonlinearTerms ?? []));
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
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==, !=, <, >) in logical 'and': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public or(_other: unknown): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==, !=, <, >) in logical 'or': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public implies(_consequent: unknown): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==, !=, <, >) in logical 'implies': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public xor(_other: unknown): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==, !=, <, >) in logical 'xor': expected a BoolVar, Constraint, or BoolOp."
    );
  }

  public not(): never {
    throw new Error(
      "Cannot use an arithmetic expression without a comparison operator (<=, >=, ==, !=, <, >) in logical 'not': expected a BoolVar, Constraint, or BoolOp."
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

    for (const nl of this.nonlinearTerms) {
      const c = nl.coeff;
      const sign = c >= 0 ? (isFirst ? "" : "+ ") : "- ";
      const absC = Math.abs(c);
      const coeffStr = absC === 1 ? "" : `${absC} `;
      parts.push(`${sign}${coeffStr}${formatNonlinearAtom(nl.atom)}`);
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

export type SumTerm = Var | LinExpr | number;

export type SumContainer<
  R extends string | number = string | number,
  C extends string | number = string | number,
> =
  | Iterable<SumTerm>
  | { readonly [K in R]: SumTerm }
  | Iterable<Iterable<SumTerm>>
  | Iterable<{ readonly [K in C]: SumTerm }>
  | { readonly [K in R]: Iterable<SumTerm> }
  | { readonly [K in R]: { readonly [L in C]: SumTerm } };

type SumRecordLeaf = LinExpr | QuadExpr | Constraint | Var | number;

type SumRecordShape<T, Inner = never> = object & {
  readonly [K in keyof T]:
    | SumRecordLeaf
    | Iterable<SumRecordLeaf>
    | DotRecordLeafMap<T[K], SumRecordLeaf>
    | DotRecordLeafMap<Inner, SumRecordLeaf>;
} & NoSymbolKeys<T>;

/**
 * Sum a 1D or 2D `Iterable` / `Array` / plain `Record` of `Var` / `LinExpr` / `number` items,
 * an `Iterable` or `Record` with a mapping function, or a numeric count `n` with an index mapper `(0 .. n - 1)`
 * into a single `LinExpr`.
 *
 * **Formulation notes**:
 * - Produces a linear expression (`LinExpr`).
 * - Accepts 1D/2D `Record` containers directly without `Object.values()`.
 * - Passing comparison `Constraint`s (`<=`, `>=`, `==`) or non-linear `QuadExpr` terms throws an Error
 *   (quadratic terms are supported in objectives only via `expr` or `.mul()`).
 *
 * @example
 * ```ts
 * const m = new Model("SumExample");
 * const x = m.continuous(3, { lb: 0, prefix: "x" });
 * const byItem = m.integer(["desk", "chair"] as const, { lb: 0 });
 *
 * // Sum an array, iterable, or Record directly (or inside expr`sum(...)`)
 * m.constraint(expr`sum(${x}) <= 100`, "total_x");
 * m.constraint(expr`sum(${byItem}) <= 50`, "total_items");
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
export function sum<T extends object>(
  record: T & NoSymbolKeys<T>,
  mapFn: (value: T[keyof T], index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function sum<T = SumContainer, TI = never>(
  container: T & (Record<any, TI> | unknown) & SumRecordShape<T, TI>
): LinExpr;
export function sum(container: SumContainer<any, any>): LinExpr;
export function sum<T = any>(
  arg1: number | Iterable<T> | Record<string | number, any>,
  arg2?: (item: any, index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr {
  const terms = new Map<Var, number>();
  const nonlinearTerms: NonlinearTerm[] = [];
  let constant = 0;

  function isConstraintObj(val: object): boolean {
    if (val instanceof Constraint || (val as { kind?: unknown }).kind === "constraint") {
      return true;
    }
    return (
      "sense" in val &&
      ((val as { sense: unknown }).sense === "<=" ||
        (val as { sense: unknown }).sense === ">=" ||
        (val as { sense: unknown }).sense === "==" ||
        (val as { sense: unknown }).sense === "!=") &&
      "lhs" in val &&
      "rhs" in val &&
      typeof (val as { rhs: unknown }).rhs === "number" &&
      typeof (val as { lhs: unknown }).lhs === "object" &&
      (val as { lhs: unknown }).lhs !== null &&
      "terms" in (val as { lhs: object }).lhs &&
      ((val as { lhs: { terms: unknown } }).lhs).terms instanceof Map
    );
  }

  function isQuadExprObj(val: object): val is QuadExpr {
    return (
      val instanceof QuadExpr ||
      ("quadTerms" in val &&
        (val as { quadTerms: unknown }).quadTerms instanceof Map &&
        "linearTerms" in val &&
        (val as { linearTerms: unknown }).linearTerms instanceof Map &&
        typeof (val as { constant?: unknown }).constant === "number")
    );
  }

  function isLinExprObj(val: object): val is LinExpr {
    return (
      val instanceof LinExpr ||
      ("terms" in val &&
        (val as { terms: unknown }).terms instanceof Map &&
        typeof (val as { constant?: unknown }).constant === "number")
    );
  }

  function isVarObj(val: object): val is Var {
    return (
      val instanceof Var ||
      (!isConstraintObj(val) &&
        typeof (val as { id?: unknown }).id === "number" &&
        typeof (val as { name?: unknown }).name === "string" &&
        typeof (val as { lb?: unknown }).lb === "number" &&
        typeof (val as { ub?: unknown }).ub === "number" &&
        typeof (val as { type?: unknown }).type === "string" &&
        typeof (val as { mul?: unknown }).mul === "function")
    );
  }

  function isLeafObj(val: object): boolean {
    return isConstraintObj(val) || isQuadExprObj(val) || isLinExprObj(val) || isVarObj(val);
  }

  function isPlainRecord(val: unknown): val is Record<string, unknown> {
    if (typeof val !== "object" || val === null || Array.isArray(val)) {
      return false;
    }
    if (isLeafObj(val)) {
      return false;
    }
    const proto = Object.getPrototypeOf(val);
    return proto === Object.prototype || proto === null;
  }

  function addVal(val: LinExpr | QuadExpr | Constraint | Var | number | undefined | null) {
    if (val === null || val === undefined) return;
    if (typeof val === "number") {
      if (!Number.isFinite(val)) {
        throw new Error(`Invalid non-finite number "${val}" in sum().`);
      }
      const nextConst = constant + val;
      if (!Number.isFinite(nextConst)) {
        throw new Error("Constant accumulation overflows finite floating-point range in sum().");
      }
      constant = nextConst;
    } else if (typeof val === "object" && isConstraintObj(val)) {
      throw new Error(
        "Cannot sum a constraint comparison (<=, >=, ==) in sum(): expected a number, Var, or LinExpr."
      );
    } else if (typeof val === "object" && isQuadExprObj(val)) {
      const quadExpr = val as QuadExpr;
      if (quadExpr.quadTerms.size > 0) {
        throw new Error(
          "Quadratic expressions are not supported in sum(): sum() produces a linear expression (LinExpr)."
        );
      }
      if (!Number.isFinite(quadExpr.constant)) {
        throw new Error(`Invalid non-finite constant "${quadExpr.constant}" in sum().`);
      }
      for (const [v, c] of quadExpr.linearTerms) {
        if (!Number.isFinite(c)) {
          throw new Error(`Invalid non-finite coefficient "${c}" in sum().`);
        }
        const cur = terms.get(v) ?? 0;
        const next = cur + c;
        if (!Number.isFinite(next)) {
          throw new Error("Coefficient accumulation overflows finite floating-point range in sum().");
        }
        terms.set(v, next);
      }
      const nextConst = constant + quadExpr.constant;
      if (!Number.isFinite(nextConst)) {
        throw new Error("Constant accumulation overflows finite floating-point range in sum().");
      }
      constant = nextConst;
      if (Array.isArray(quadExpr.nonlinearTerms)) {
        for (const nl of quadExpr.nonlinearTerms) {
          if (!Number.isFinite(nl.coeff)) {
            throw new Error(`Invalid non-finite coefficient "${nl.coeff}" in sum().`);
          }
          if (nl.coeff !== 0) {
            nonlinearTerms.push({ atom: cloneNonlinearAtom(nl.atom), coeff: nl.coeff });
          }
        }
      }
    } else if (typeof val === "object" && isLinExprObj(val)) {
      const linExpr = val as LinExpr;
      if (!Number.isFinite(linExpr.constant)) {
        throw new Error(`Invalid non-finite constant "${linExpr.constant}" in sum().`);
      }
      for (const [v, c] of linExpr.terms) {
        if (!Number.isFinite(c)) {
          throw new Error(`Invalid non-finite coefficient "${c}" in sum().`);
        }
        const cur = terms.get(v) ?? 0;
        const next = cur + c;
        if (!Number.isFinite(next)) {
          throw new Error("Coefficient accumulation overflows finite floating-point range in sum().");
        }
        terms.set(v, next);
      }
      const nextConst = constant + linExpr.constant;
      if (!Number.isFinite(nextConst)) {
        throw new Error("Constant accumulation overflows finite floating-point range in sum().");
      }
      constant = nextConst;
      if (Array.isArray(linExpr.nonlinearTerms)) {
        for (const nl of linExpr.nonlinearTerms) {
          if (!Number.isFinite(nl.coeff)) {
            throw new Error(`Invalid non-finite coefficient "${nl.coeff}" in sum().`);
          }
          if (nl.coeff !== 0) {
            nonlinearTerms.push({ atom: cloneNonlinearAtom(nl.atom), coeff: nl.coeff });
          }
        }
      }
    } else if (typeof val === "object" && isVarObj(val)) {
      const v = val as Var;
      const cur = terms.get(v) ?? 0;
      const next = cur + 1;
      if (!Number.isFinite(next)) {
        throw new Error("Coefficient accumulation overflows finite floating-point range in sum().");
      }
      terms.set(v, next);
    } else {
      throw new Error("Unsupported item in sum(): expected a number, Var, or LinExpr.");
    }
  }

  function visitItem(item: unknown, depth: number = 0) {
    if (item === null || item === undefined) return;
    if (typeof item === "number") {
      addVal(item);
      return;
    }
    if (typeof item === "object") {
      if (isLeafObj(item)) {
        addVal(item as LinExpr | QuadExpr | Constraint | Var);
        return;
      }
      if (
        !(item instanceof String) &&
        !(item instanceof Map) &&
        Symbol.iterator in item &&
        typeof (item as Iterable<unknown>)[Symbol.iterator] === "function"
      ) {
        if (depth >= 2) {
          throw new Error("Nested containers deeper than 2D are not supported in sum().");
        }
        for (const sub of item as Iterable<unknown>) {
          visitItem(sub, depth + 1);
        }
        return;
      }
      if (isPlainRecord(item)) {
        if (depth >= 2) {
          throw new Error("Nested containers deeper than 2D are not supported in sum().");
        }
        if (Object.getOwnPropertySymbols(item).length > 0) {
          throw new Error("Symbol keys are not supported in sum().");
        }
        for (const key of Object.keys(item)) {
          visitItem(item[key], depth + 1);
        }
        return;
      }
    }
    addVal(item as any);
  }

  if (typeof arg1 === "number") {
    if (typeof arg2 !== "function") {
      throw new Error("sum(count, mapFn) requires a mapping function as the second argument.");
    }
    if (!Number.isInteger(arg1) || arg1 < 0) {
      throw new Error("sum(count, mapFn) requires a non-negative integer count.");
    }
    const count = arg1;
    for (let i = 0; i < count; i++) {
      visitItem(arg2(i, i), 0);
    }
  } else if (
    typeof arg1 === "object" &&
    arg1 !== null &&
    !(arg1 instanceof String) &&
    (!(arg1 instanceof Map) || typeof arg2 === "function") &&
    Symbol.iterator in arg1 &&
    typeof (arg1 as Iterable<T>)[Symbol.iterator] === "function"
  ) {
    let index = 0;
    for (const item of arg1 as Iterable<T>) {
      if (arg2) {
        visitItem(arg2(item, index++), 0);
      } else {
        visitItem(item, 1);
      }
    }
  } else if (isPlainRecord(arg1)) {
    if (Object.getOwnPropertySymbols(arg1).length > 0) {
      throw new Error("Symbol keys are not supported in sum().");
    }
    let index = 0;
    for (const key of Object.keys(arg1)) {
      const item = arg1[key];
      if (arg2) {
        visitItem(arg2(item, index++), 0);
      } else {
        visitItem(item, 1);
      }
    }
  } else {
    throw new Error("Unsupported item in sum(): expected an Iterable, Record, or (count, mapFn).");
  }

  // Prune exact zero terms
  for (const [v, c] of terms) {
    if (c === 0) {
      terms.delete(v);
    }
  }

  return new LinExpr(terms, constant, nonlinearTerms);
}

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
  const nonlinearTerms: NonlinearTerm[] = [];
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
      if (Array.isArray(exprOrVar.nonlinearTerms) && coeff !== 0) {
        for (const nl of exprOrVar.nonlinearTerms) {
          if (!Number.isFinite(nl.coeff)) {
            throw new Error(
              `Invalid non-finite coefficient "${nl.coeff}" in dot() at '${path || "root"}'.`
            );
          }
          const prod = coeff * nl.coeff;
          if (nl.coeff !== 0 && prod === 0) {
            throw new Error("Coefficient multiplication underflows to zero.");
          }
          if (!Number.isFinite(prod)) {
            throw new Error(
              `Coefficient multiplication overflows finite floating-point range in dot() at '${path || "root"}'.`
            );
          }
          if (prod !== 0) {
            nonlinearTerms.push({ atom: cloneNonlinearAtom(nl.atom), coeff: prod });
          }
        }
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

  return new LinExpr(terms, constant, nonlinearTerms);
}

/**
 * Compute the absolute value $|e|$ of a scalar expression (`number`, `Var`, or `LinExpr`).
 *
 * **Lowering behavior**:
 * - **HiGHS / GLPK**: Pure LP epigraph (`t >= e, t >= -e`, zero binary variables) when used in a convex direction (`minimize(abs(e))`, `abs(e) <= rhs`); exact bounded MIP linearization using finite `[lb, ub]` bounds otherwise.
 * - **Pumpkin**: Native `absolute` propagator on bounded integer expressions (`Continuous` rejected).
 * - **Z3**: Exact `ITE` arithmetic AST on `Int` and `Real` sorts.
 *
 * @example
 * ```ts
 * const m = new Model("AbsExample");
 * const a = m.continuous("a", { lb: 0, ub: 10 });
 * const b = m.continuous("b", { lb: 0, ub: 10 });
 * m.constraint(a.eq(7));
 * m.constraint(abs(a.sub(b)).le(2), "balance");
 * m.objective(minimize(b));
 * ```
 */
export function abs(value: number | Var | LinExpr | QuadExpr | Constraint): LinExpr {
  const lin = toScalarLinExpr(value, "abs()");
  if (lin.terms.size === 0 && lin.nonlinearTerms.length === 0) {
    return new LinExpr(new Map(), Math.abs(lin.constant) + 0);
  }
  return new LinExpr(new Map(), 0, [{ atom: { kind: "abs", arg: lin }, coeff: 1 }]);
}

export type ExtremumTerm = Var | LinExpr | QuadExpr | Constraint | number;

export type ExtremumArg<T = any> =
  | SumContainer<any, any>
  | ExtremumTerm
  | Iterable<T>
  | {
      readonly [key: string]:
        | ExtremumTerm
        | Iterable<ExtremumTerm>
        | { readonly [subKey: string]: ExtremumTerm };
    };

function collectExtremumItems(
  fnName: "max" | "min",
  args: readonly unknown[]
): LinExpr[] {
  if (args.length === 0) {
    throw new Error(`${fnName}() requires at least one expression.`);
  }

  const items: LinExpr[] = [];
  const isLeaf = (val: unknown): boolean =>
    typeof val === "number" ||
    isConstraint(val) ||
    isVarLikeExpr(val) ||
    val instanceof LinExpr ||
    val instanceof QuadExpr ||
    (typeof val === "object" &&
      val !== null &&
      (("terms" in val && (val as { terms: unknown }).terms instanceof Map) ||
        ("quadTerms" in val && (val as { quadTerms: unknown }).quadTerms instanceof Map)));

  const isPlainRecord = (val: unknown): val is Record<string, unknown> => {
    if (typeof val !== "object" || val === null || Array.isArray(val)) return false;
    if (isLeaf(val)) return false;
    const proto = Object.getPrototypeOf(val);
    return proto === Object.prototype || proto === null;
  };

  const pushScalar = (val: unknown) => {
    items.push(toScalarLinExpr(val, `${fnName}()`));
  };

  const visitContainer = (val: unknown, depth: number): void => {
    if (val === null || val === undefined) {
      throw new Error(`Unsupported nullish item in ${fnName}(): expected a finite number, Var, or LinExpr.`);
    }
    if (typeof val === "number" || isLeaf(val)) {
      pushScalar(val);
      return;
    }
    if (Array.isArray(val)) {
      if (depth >= 2) {
        throw new Error(`Nested containers deeper than 2D are not supported in ${fnName}().`);
      }
      for (let i = 0; i < val.length; i++) {
        if (!(i in val)) {
          throw new Error(`Unsupported item in ${fnName}(): sparse array hole at index ${i}.`);
        }
        visitContainer(val[i], depth + 1);
      }
      return;
    }
    if (
      typeof val === "object" &&
      !(val instanceof String) &&
      !(val instanceof Map) &&
      Symbol.iterator in val &&
      typeof (val as Iterable<unknown>)[Symbol.iterator] === "function"
    ) {
      if (depth >= 2) {
        throw new Error(`Nested containers deeper than 2D are not supported in ${fnName}().`);
      }
      for (const sub of val as Iterable<unknown>) {
        visitContainer(sub, depth + 1);
      }
      return;
    }
    if (isPlainRecord(val)) {
      if (depth >= 2) {
        throw new Error(`Nested containers deeper than 2D are not supported in ${fnName}().`);
      }
      if (Object.getOwnPropertySymbols(val).length > 0) {
        throw new Error(`Symbol keys are not supported in ${fnName}().`);
      }
      for (const key of Object.keys(val)) {
        visitContainer(val[key], depth + 1);
      }
      return;
    }
    throw new Error(`Unsupported item in ${fnName}(): expected a finite number, Var, or LinExpr.`);
  };

  if (args.length === 2 && typeof args[1] === "function") {
    const first = args[0];
    const mapFn = args[1] as (item: any, index: number) => unknown;
    if (typeof first === "number") {
      if (!Number.isInteger(first) || first < 0) {
        throw new Error(`${fnName}(count, mapFn) requires a non-negative integer count.`);
      }
      for (let i = 0; i < first; i++) {
        visitContainer(mapFn(i, i), 0);
      }
    } else if (Array.isArray(first)) {
      for (let i = 0; i < first.length; i++) {
        if (!(i in first)) {
          throw new Error(`Unsupported item in ${fnName}(): sparse array hole at index ${i}.`);
        }
        visitContainer(mapFn(first[i], i), 0);
      }
    } else if (
      typeof first === "object" &&
      first !== null &&
      !(first instanceof String) &&
      Symbol.iterator in first &&
      typeof (first as Iterable<unknown>)[Symbol.iterator] === "function"
    ) {
      let idx = 0;
      for (const item of first as Iterable<unknown>) {
        visitContainer(mapFn(item, idx++), 0);
      }
    } else if (isPlainRecord(first)) {
      if (Object.getOwnPropertySymbols(first).length > 0) {
        throw new Error(`Symbol keys are not supported in ${fnName}().`);
      }
      let idx = 0;
      for (const key of Object.keys(first)) {
        visitContainer(mapFn(first[key], idx++), 0);
      }
    } else {
      throw new Error(
        `Invalid first argument in ${fnName}(itemsOrCount, mapFn): expected an Iterable, Record, or non-negative integer count.`
      );
    }
  } else {
    for (const arg of args) {
      if (typeof arg === "function") {
        throw new Error(
          `Function interpolation in ${fnName}() is only supported as ${fnName}(itemsOrCount, mapFn).`
        );
      }
      visitContainer(arg, 0);
    }
  }

  if (items.length === 0) {
    throw new Error(`${fnName}() requires at least one expression.`);
  }
  return items;
}

function buildExtremumExpr(fnName: "max" | "min", items: LinExpr[]): LinExpr {
  if (items.length === 1) {
    return items[0].clone();
  }
  if (items.every((item) => item.terms.size === 0 && item.nonlinearTerms.length === 0)) {
    const vals = items.map((item) => item.constant);
    const folded = fnName === "max" ? Math.max(...vals) : Math.min(...vals);
    return new LinExpr(new Map(), Object.is(folded, -0) ? 0 : folded);
  }
  return new LinExpr(new Map(), 0, [{ atom: { kind: fnName, args: items }, coeff: 1 }]);
}

/**
 * Compute the maximum $\max(e_1, \dots, e_n)$ across variadic scalar expressions,
 * 1D/2D `Array` / `Iterable` / `Record` containers, or a `(itemsOrCount, mapFn)` mapper.
 *
 * @example
 * ```ts
 * const m = new Model("MaxExample");
 * const x = m.continuous("x", { lb: 2, ub: 10 });
 * const y = m.continuous("y", { lb: 5, ub: 10 });
 * m.objective(minimize(max(x, y)));
 * ```
 */
export function max(
  count: number,
  mapFn: (index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function max<T = any>(
  items: Iterable<T>,
  mapFn: (item: T, index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function max<T extends object>(
  record: T & NoSymbolKeys<T>,
  mapFn: (value: T[keyof T], index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function max(...args: ExtremumArg[]): LinExpr;
export function max(...args: unknown[]): LinExpr {
  return buildExtremumExpr("max", collectExtremumItems("max", args));
}

/**
 * Compute the minimum $\min(e_1, \dots, e_n)$ across variadic scalar expressions,
 * 1D/2D `Array` / `Iterable` / `Record` containers, or a `(itemsOrCount, mapFn)` mapper.
 *
 * @example
 * ```ts
 * const m = new Model("MinExample");
 * const x = m.continuous("x", { lb: 0, ub: 8 });
 * const y = m.continuous("y", { lb: 0, ub: 5 });
 * m.objective(maximize(min(x, y)));
 * ```
 */
export function min(
  count: number,
  mapFn: (index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function min<T = any>(
  items: Iterable<T>,
  mapFn: (item: T, index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function min<T extends object>(
  record: T & NoSymbolKeys<T>,
  mapFn: (value: T[keyof T], index: number) => LinExpr | QuadExpr | Constraint | Var | number
): LinExpr;
export function min(...args: ExtremumArg[]): LinExpr;
export function min(...args: unknown[]): LinExpr {
  return buildExtremumExpr("min", collectExtremumItems("min", args));
}

/**
 * 0-based variable-indexed lookup `array[index]` (CP `Element` constraint).
 * Automatically enforces $0 \le \text{index} < \text{array.length}$ and rejects `Continuous` or fractional indices.
 *
 * @example
 * ```ts
 * const m = new Model("AtExample");
 * const route = m.integer("route", { lb: 0, ub: 2 });
 * m.objective(minimize(at([30, 12, 25], route)));
 * ```
 */
export function at(
  array: ReadonlyArray<number | Var | LinExpr | QuadExpr | Constraint>,
  index: number | Var | LinExpr | QuadExpr | Constraint
): LinExpr {
  if (!Array.isArray(array)) {
    throw new Error("at(array, index) requires an Array as its first argument.");
  }
  if (array.length === 0) {
    throw new Error("at(array, index) requires an array with at least 1 element.");
  }
  const normalizedArray: LinExpr[] = new Array(array.length);
  for (let i = 0; i < array.length; i++) {
    if (!(i in array)) {
      throw new Error(`at(array, index) encountered sparse array hole at index ${i}.`);
    }
    normalizedArray[i] = toScalarLinExpr(array[i], `at() array[${i}]`);
  }
  const indexLin = toScalarLinExpr(index, "at() index");
  const discreteVars = collectAndValidateDiscreteExpr(indexLin, "at() index");
  return new LinExpr(new Map(), 0, [
    {
      atom: {
        kind: "at",
        array: normalizedArray,
        index: indexLin,
        discreteVars,
      },
      coeff: 1,
    },
  ]);
}


