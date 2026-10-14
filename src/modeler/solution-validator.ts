import type { Var } from "./variable.js";
import type { LinExpr } from "./expression.js";
import { Constraint } from "./constraint.js";
import { BoolVar, BoolOp, type LogicElement } from "./boolean-expr.js";
import type { ComparisonSense } from "./types.js";
import type { Model } from "./model.js";

export interface SolutionValidationOptions {
  /**
   * Optional map of variable and Boolean variable values (keyed by variable name) to validate.
   * When omitted, `validateSolution()` inspects the current `.value` properties on the model's variables.
   */
  values?: Record<string, number | boolean | null | undefined>;
  /**
   * Maximum allowed violation for variable bounds and linear constraints (default: `1e-6`).
   */
  feasibilityTolerance?: number;
  /**
   * Maximum allowed distance to the nearest integer for Integer and Binary variables (default: `1e-6`).
   */
  integralityTolerance?: number;
  /**
   * Whether to evaluate logical (SMT/propositional) constraints using the built-in evaluator (default: `true`).
   * If `false`, or if any logical constraint cannot be evaluated due to missing values or unsupported operators,
   * those constraints are reported in `uncheckedConstraints` and `complete` / `valid` are set to `false`.
   */
  evaluateLogicalConstraints?: boolean;
}

export type ViolationType =
  | "missing_value"
  | "non_finite_value"
  | "invalid_boolean_value"
  | "lower_bound"
  | "upper_bound"
  | "integrality"
  | "linear_constraint"
  | "logical_constraint"
  | "unchecked_constraint";

export interface SolutionViolation {
  type: ViolationType;
  target: "variable" | "bool_variable" | "constraint" | "logical_constraint";
  name: string;
  actual?: number | boolean | null;
  limit?: number | boolean;
  rhs?: number;
  sense?: ComparisonSense;
  varType?: "Continuous" | "Integer" | "Binary";
  nearestInteger?: number;
  /** Non-negative magnitude of the violation (or Infinity/NaN if non-finite) */
  violation: number;
  /** Signed residual (e.g. actual - limit, or lhs - rhs) when applicable */
  signedViolation?: number;
  message: string;
}

export interface SolutionValidationSummary {
  checkedVariables: number;
  totalVariables: number;
  checkedBoolVariables: number;
  totalBoolVariables: number;
  checkedLinearConstraints: number;
  totalLinearConstraints: number;
  checkedLogicalConstraints: number;
  totalLogicalConstraints: number;
}

export interface SolutionValidationReport {
  /**
   * True if and only if `complete === true`, `uncheckedConstraints.length === 0`, and `violations.length === 0`.
   * Note: Validates satisfaction of modeled mathematical constraints only; does not verify natural-language specification coverage.
   */
  valid: boolean;
  /**
   * True when all model variables, Boolean variables, linear constraints, and logical constraints were fully evaluated.
   */
  complete: boolean;
  /**
   * Flat list of all violations found.
   */
  violations: SolutionViolation[];
  /**
   * Violations grouped by variable or constraint name.
   */
  violationsByName: Record<string, SolutionViolation[]>;
  /**
   * Names of constraints (linear or logical) that could not be evaluated (e.g. due to missing variable values
   * or `evaluateLogicalConstraints: false`). Never implicitly treated as satisfied.
   */
  uncheckedConstraints: string[];
  /**
   * Names of numeric or Boolean variables whose values were missing (`null` or `undefined`).
   */
  missingVariables: string[];
  /**
   * Maximum numeric violation magnitude across all evaluated bounds, integrality checks, and constraints.
   */
  maxViolation: number;
  /**
   * Coverage summary counts.
   */
  summary: SolutionValidationSummary;
}

function validateTolerance(value: unknown, optionName: string): number {
  if (value === undefined) return 1e-6;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid ${optionName}: expected a finite non-negative number, received ${String(value)}.`
    );
  }
  return value;
}

/**
 * Validates supplied or last-solved variable values against a Model's variable bounds,
 * integrality requirements, linear constraints, and logical constraints.
 * Runs purely in JavaScript/TypeScript without requiring any WASM solver runtime.
 */
export function validateModelSolution(
  model: Model,
  options: SolutionValidationOptions = {}
): SolutionValidationReport {
  const feasibilityTolerance = validateTolerance(
    options.feasibilityTolerance,
    "feasibilityTolerance"
  );
  const integralityTolerance = validateTolerance(
    options.integralityTolerance,
    "integralityTolerance"
  );
  const evaluateLogical =
    options.evaluateLogicalConstraints !== undefined
      ? Boolean(options.evaluateLogicalConstraints)
      : true;

  const hasExplicitValues = options.values !== undefined && options.values !== null;
  if (
    options.values !== undefined &&
    (typeof options.values !== "object" || options.values === null || Array.isArray(options.values))
  ) {
    throw new Error(
      "Invalid values option: expected a plain object mapping variable names to values."
    );
  }
  const explicitValues = options.values;

  const violations: SolutionViolation[] = [];
  const violationsByName: Record<string, SolutionViolation[]> = Object.create(null);
  const uncheckedConstraints: string[] = [];
  const missingVariables: string[] = [];
  let maxViolation = 0;

  const updateMaxViolation = (viol: number) => {
    if (typeof viol === "number" && !Number.isNaN(viol) && viol > maxViolation) {
      maxViolation = viol;
    }
  };

  const recordViolation = (v: SolutionViolation) => {
    violations.push(v);
    if (!Object.prototype.hasOwnProperty.call(violationsByName, v.name)) {
      violationsByName[v.name] = [];
    }
    violationsByName[v.name].push(v);
    if (v.type !== "missing_value" && v.type !== "unchecked_constraint") {
      updateMaxViolation(v.violation);
    }
  };

  const numericValues = new Map<Var, number>();
  const booleanValues = new Map<BoolVar, boolean>();

  let checkedVariables = 0;
  let checkedBoolVariables = 0;
  let checkedLinearConstraints = 0;
  let checkedLogicalConstraints = 0;

  // 1. Validate numeric variables (presence, finiteness, bounds, integrality)
  for (const v of model.variables) {
    const rawVal = hasExplicitValues
      ? Object.prototype.hasOwnProperty.call(explicitValues, v.name)
        ? explicitValues![v.name]
        : undefined
      : v.value;

    if (rawVal === null || rawVal === undefined) {
      missingVariables.push(v.name);
      recordViolation({
        type: "missing_value",
        target: "variable",
        name: v.name,
        actual: rawVal ?? null,
        violation: Infinity,
        message: `Variable "${v.name}" has no assigned solution value.`,
      });
      continue;
    }

    if (typeof rawVal !== "number" || !Number.isFinite(rawVal)) {
      recordViolation({
        type: "non_finite_value",
        target: "variable",
        name: v.name,
        actual: rawVal as any,
        violation: Infinity,
        message: `Variable "${v.name}" has non-finite or non-numeric value: ${String(rawVal)}.`,
      });
      continue;
    }

    numericValues.set(v, rawVal);
    checkedVariables++;

    const isBinary = v.type === "Binary" || (v.type as string) === "BINARY";
    const isInteger = isBinary || v.type === "Integer" || (v.type as string) === "INTEGER";

    const effectiveLb = isBinary ? Math.max(0, v.lb) : v.lb;
    const effectiveUb = isBinary ? Math.min(1, v.ub) : v.ub;

    if (effectiveLb !== -Infinity) {
      const signed = rawVal - effectiveLb;
      const viol = Math.max(0, effectiveLb - rawVal);
      updateMaxViolation(viol);
      if (viol > feasibilityTolerance) {
        recordViolation({
          type: "lower_bound",
          target: "variable",
          name: v.name,
          actual: rawVal,
          limit: effectiveLb,
          violation: viol,
          signedViolation: signed,
          message: `Variable "${v.name}" value (${rawVal}) violates lower bound (${effectiveLb}) by ${viol}.`,
        });
      }
    }

    if (effectiveUb !== Infinity) {
      const signed = rawVal - effectiveUb;
      const viol = Math.max(0, rawVal - effectiveUb);
      updateMaxViolation(viol);
      if (viol > feasibilityTolerance) {
        recordViolation({
          type: "upper_bound",
          target: "variable",
          name: v.name,
          actual: rawVal,
          limit: effectiveUb,
          violation: viol,
          signedViolation: signed,
          message: `Variable "${v.name}" value (${rawVal}) violates upper bound (${effectiveUb}) by ${viol}.`,
        });
      }
    }

    if (isInteger) {
      const nearest = Math.round(rawVal);
      const signed = rawVal - nearest;
      const viol = Math.abs(signed);
      updateMaxViolation(viol);
      if (viol > integralityTolerance) {
        recordViolation({
          type: "integrality",
          target: "variable",
          name: v.name,
          varType: isBinary ? "Binary" : "Integer",
          actual: rawVal,
          nearestInteger: nearest,
          violation: viol,
          signedViolation: signed,
          message: `${isBinary ? "Binary" : "Integer"} variable "${v.name}" value (${rawVal}) violates integrality by ${viol} (nearest integer: ${nearest}).`,
        });
      }
    }
  }

  // 2. Validate Boolean variables
  for (const bv of model.boolVars) {
    const rawVal = hasExplicitValues
      ? Object.prototype.hasOwnProperty.call(explicitValues, bv.name)
        ? explicitValues![bv.name]
        : undefined
      : bv.value;

    if (rawVal === null || rawVal === undefined) {
      missingVariables.push(bv.name);
      recordViolation({
        type: "missing_value",
        target: "bool_variable",
        name: bv.name,
        actual: rawVal ?? null,
        violation: Infinity,
        message: `Boolean variable "${bv.name}" has no assigned solution value.`,
      });
      continue;
    }

    if (typeof rawVal !== "boolean") {
      recordViolation({
        type: "invalid_boolean_value",
        target: "bool_variable",
        name: bv.name,
        actual: rawVal as any,
        violation: Infinity,
        message: `Boolean variable "${bv.name}" has non-boolean value: ${String(rawVal)}.`,
      });
      continue;
    }

    booleanValues.set(bv, rawVal);
    checkedBoolVariables++;
  }

  // Helper to evaluate a linear expression
  const evalLinExpr = (
    expr: LinExpr
  ): { ok: true; value: number } | { ok: false; reason: string } => {
    let sum = expr.constant !== undefined ? expr.constant : 0;
    for (const [v, coeff] of expr.terms) {
      if (coeff === 0) continue;
      if (!numericValues.has(v)) {
        return { ok: false, reason: `missing or invalid value for variable "${v.name}"` };
      }
      sum += coeff * numericValues.get(v)!;
    }
    return { ok: true, value: sum };
  };

  // Helper to evaluate a linear constraint residual
  const checkLinearConstraint = (
    c: Constraint,
    tol: number = feasibilityTolerance
  ):
    | { status: "satisfied"; lhsVal: number; signed: number; violation: number }
    | { status: "violated"; lhsVal: number; signed: number; violation: number; message: string }
    | { status: "unchecked"; reason: string } => {
    const lhsRes = evalLinExpr(c.lhs);
    if (!lhsRes.ok) {
      return { status: "unchecked", reason: lhsRes.reason };
    }

    const lhsVal = lhsRes.value;
    const signed = lhsVal - c.rhs;
    const viol =
      c.sense === "<="
        ? Math.max(0, signed)
        : c.sense === ">="
          ? Math.max(0, -signed)
          : Math.abs(signed);

    if (viol > tol) {
      return {
        status: "violated",
        lhsVal,
        signed,
        violation: viol,
        message: `Constraint "${c.name}" (${lhsVal} ${c.sense} ${c.rhs}) violated by ${viol}.`,
      };
    }
    return { status: "satisfied", lhsVal, signed, violation: viol };
  };

  // 3. Validate linear constraints
  for (const c of model.constraints) {
    const res = checkLinearConstraint(c);
    if (res.status === "unchecked") {
      uncheckedConstraints.push(c.name);
      recordViolation({
        type: "unchecked_constraint",
        target: "constraint",
        name: c.name,
        sense: c.sense,
        limit: c.rhs,
        rhs: c.rhs,
        violation: Infinity,
        message: `Constraint "${c.name}" could not be evaluated: ${res.reason}.`,
      });
    } else if (res.status === "violated") {
      checkedLinearConstraints++;
      recordViolation({
        type: "linear_constraint",
        target: "constraint",
        name: c.name,
        sense: c.sense,
        actual: res.lhsVal,
        limit: c.rhs,
        rhs: c.rhs,
        violation: res.violation,
        signedViolation: res.signed,
        message: res.message,
      });
    } else {
      checkedLinearConstraints++;
      updateMaxViolation(res.violation);
    }
  }

  // 4. Validate logical constraints
  type LogicEvalResult =
    | { ok: true; value: boolean; violation: number }
    | { ok: false; reason: string };

  const evalLogicNode = (elem: LogicElement, negated = false): LogicEvalResult => {
    if (elem instanceof BoolVar) {
      if (!booleanValues.has(elem)) {
        return { ok: false, reason: `missing or invalid value for Boolean variable "${elem.name}"` };
      }
      return { ok: true, value: booleanValues.get(elem)!, violation: 0 };
    }
    if (elem instanceof Constraint) {
      const tol = negated ? 0 : feasibilityTolerance;
      const res = checkLinearConstraint(elem, tol);
      if (res.status === "unchecked") {
        return { ok: false, reason: res.reason };
      }
      const isSatisfied = res.status === "satisfied";
      return {
        ok: true,
        value: isSatisfied,
        violation: isSatisfied ? res.violation : 0,
      };
    }
    if (elem instanceof BoolOp) {
      switch (elem.op) {
        case "not": {
          const sub = evalLogicNode(elem.children[0], !negated);
          if (!sub.ok) return sub;
          return { ok: true, value: !sub.value, violation: 0 };
        }
        case "and": {
          let maxViol = 0;
          for (const child of elem.children) {
            const sub = evalLogicNode(child, negated);
            if (!sub.ok) return sub;
            if (!sub.value) return { ok: true, value: false, violation: 0 };
            if (sub.violation > maxViol) maxViol = sub.violation;
          }
          return { ok: true, value: true, violation: maxViol };
        }
        case "or": {
          let anyTrue = false;
          let minTrueViol = Infinity;
          for (const child of elem.children) {
            const sub = evalLogicNode(child, negated);
            if (!sub.ok) return sub;
            if (sub.value) {
              anyTrue = true;
              if (sub.violation < minTrueViol) minTrueViol = sub.violation;
            }
          }
          return { ok: true, value: anyTrue, violation: anyTrue ? minTrueViol : 0 };
        }
        case "implies": {
          const left = evalLogicNode(elem.children[0], !negated);
          if (!left.ok) return left;
          if (!left.value) return { ok: true, value: true, violation: 0 };
          const right = evalLogicNode(elem.children[1], negated);
          if (!right.ok) return right;
          return { ok: true, value: right.value, violation: right.value ? right.violation : 0 };
        }
        case "xor": {
          let parity = false;
          let maxViol = 0;
          for (const child of elem.children) {
            const sub = evalLogicNode(child, negated);
            if (!sub.ok) return sub;
            if (sub.value) {
              parity = !parity;
              if (sub.violation > maxViol) maxViol = sub.violation;
            }
          }
          return { ok: true, value: parity, violation: parity ? maxViol : 0 };
        }
        default:
          return { ok: false, reason: `unsupported logical operator "${String((elem as any).op)}"` };
      }
    }
    return { ok: false, reason: "unsupported logical expression node" };
  };

  for (let i = 0; i < model.logicalConstraints.length; i++) {
    const lc = model.logicalConstraints[i];
    const lcName = lc.name || `lc_${i + 1}`;
    if (!evaluateLogical) {
      uncheckedConstraints.push(lcName);
      recordViolation({
        type: "unchecked_constraint",
        target: "logical_constraint",
        name: lcName,
        violation: Infinity,
        message: `Logical constraint "${lcName}" was not evaluated because evaluateLogicalConstraints is false.`,
      });
      continue;
    }

    const res = evalLogicNode(lc.expr);
    if (!res.ok) {
      uncheckedConstraints.push(lcName);
      recordViolation({
        type: "unchecked_constraint",
        target: "logical_constraint",
        name: lcName,
        violation: Infinity,
        message: `Logical constraint "${lcName}" could not be evaluated: ${res.reason}.`,
      });
      continue;
    }

    checkedLogicalConstraints++;
    if (!res.value) {
      recordViolation({
        type: "logical_constraint",
        target: "logical_constraint",
        name: lcName,
        actual: false,
        limit: true,
        violation: 1,
        signedViolation: -1,
        message: `Logical constraint "${lcName}" evaluated to false.`,
      });
    } else {
      updateMaxViolation(res.violation);
    }
  }

  const complete =
    checkedVariables === model.variables.length &&
    checkedBoolVariables === model.boolVars.length &&
    checkedLinearConstraints === model.constraints.length &&
    checkedLogicalConstraints === model.logicalConstraints.length &&
    uncheckedConstraints.length === 0 &&
    missingVariables.length === 0;

  const valid = complete && violations.length === 0;

  return {
    valid,
    complete,
    violations,
    violationsByName,
    uncheckedConstraints,
    missingVariables,
    maxViolation,
    summary: {
      checkedVariables,
      totalVariables: model.variables.length,
      checkedBoolVariables,
      totalBoolVariables: model.boolVars.length,
      checkedLinearConstraints,
      totalLinearConstraints: model.constraints.length,
      checkedLogicalConstraints,
      totalLogicalConstraints: model.logicalConstraints.length,
    },
  };
}
