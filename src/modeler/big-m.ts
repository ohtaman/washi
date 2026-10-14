import { LinExpr } from "./expression.js";
import { Var } from "./variable.js";

/**
 * Options for indicator constraints with Big-M linearization.
 */
export interface IndicatorOptions {
  /**
   * The binary variable value (0 or 1) that activates the constraint.
   * Defaults to 1 (i.e. constraint holds when binVar == 1).
   */
  activeValue?: 0 | 1;

  /**
   * Explicit Big-M scalar value override.
   * If omitted, WaSHI automatically derives a safe, tight Big-M from the
   * linear expression terms and finite variable bounds.
   * If provided, it must be a finite positive number.
   *
   * Note: The user is responsible for ensuring that a custom M is sufficiently
   * large to avoid truncating valid solutions while small enough to maintain
   * numerical stability.
   */
  M?: number;

  /**
   * Base name for generated linear constraints.
   */
  name?: string;
}

/**
 * Validates a user-supplied Big-M override value.
 * Must be a finite positive number (> 0).
 */
export function validateUserBigM(M: number, constraintName: string): void {
  if (typeof M !== "number" || !Number.isFinite(M) || M <= 0) {
    throw new Error(
      `Invalid Big-M value for indicator constraint "${constraintName}": expected a finite positive number, received ${M}.`
    );
  }
}

function validateIndicatorExpressionInputs(
  lhs: LinExpr,
  rhs: number,
  constraintName: string
): number {
  const constant = lhs.constant !== undefined ? lhs.constant : 0;
  if (!Number.isFinite(rhs) || !Number.isFinite(constant)) {
    throw new Error(
      `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
      `constraint contains non-finite constant (${constant}) or right-hand side (${rhs}).`
    );
  }
  const effectiveRhs = rhs - constant;
  if (!Number.isFinite(effectiveRhs)) {
    throw new Error(
      `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
      `effective right-hand side (${rhs} - ${constant}) overflows finite floating-point range. ` +
      `Please rescale coefficients/constants.`
    );
  }
  for (const [v, coeff] of lhs.terms) {
    if (!Number.isFinite(coeff)) {
      throw new Error(
        `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
        `variable "${v.name}" has non-finite coefficient (${coeff}).`
      );
    }
    if (
      Number.isNaN(v.lb) ||
      Number.isNaN(v.ub) ||
      v.lb === Infinity ||
      v.ub === -Infinity ||
      v.lb > v.ub
    ) {
      throw new Error(
        `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
        `variable "${v.name}" has invalid bounds [${v.lb}, ${v.ub}].`
      );
    }
  }
  return effectiveRhs;
}

/**
 * Derives a sufficient, tight Big-M value for a "<=" linear inequality:
 *   lhs <= rhs  (or terms <= effectiveRhs)
 *
 * When the indicator variable is inactive, the relaxed constraint becomes:
 *   terms <= effectiveRhs + M
 *
 * For the constraint to be trivially satisfied over all domain values x in [lb, ub]:
 *   effectiveRhs + M >= max(terms)  <=>  M >= max(terms) - effectiveRhs
 *
 * Therefore, the safe tight non-negative Big-M is:
 *   M = max(0, max(terms) - effectiveRhs)
 *
 * Fails with an actionable error if any variable lacks a required finite bound
 * or if finite arithmetic overflows.
 */
export function deriveBigMForLe(
  lhs: LinExpr,
  rhs: number,
  constraintName: string
): number {
  const effectiveRhs = validateIndicatorExpressionInputs(lhs, rhs, constraintName);
  let maxLhs = 0;

  for (const [v, coeff] of lhs.terms) {
    if (coeff === 0) continue;
    let boundVal: number;
    if (coeff > 0) {
      if (!Number.isFinite(v.ub)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite upper bound (required because coefficient ${coeff} is positive in <= constraint). ` +
          `Please set an explicit finite upper bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      boundVal = v.ub;
    } else {
      if (!Number.isFinite(v.lb)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite lower bound (required because coefficient ${coeff} is negative in <= constraint). ` +
          `Please set an explicit finite lower bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      boundVal = v.lb;
    }

    const termMax = coeff * boundVal;
    maxLhs += termMax;
    if (!Number.isFinite(termMax) || !Number.isFinite(maxLhs)) {
      throw new Error(
        `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
        `numeric overflow while bounding contribution of variable "${v.name}". ` +
        `Please rescale coefficients/bounds or specify a finite { M } explicitly.`
      );
    }
  }

  const rawDiff = maxLhs - effectiveRhs;
  if (!Number.isFinite(rawDiff)) {
    throw new Error(
      `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
      `numeric overflow while computing Big-M (${maxLhs} - ${effectiveRhs}). ` +
      `Please rescale coefficients/bounds or specify a finite { M } explicitly.`
    );
  }

  const M = Math.max(0, rawDiff);
  if (!Number.isFinite(M) || !Number.isFinite(effectiveRhs + M)) {
    throw new Error(
      `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
      `derived Big-M (${M}) or shifted right-hand side overflows finite floating-point range. ` +
      `Please rescale coefficients/bounds or specify a finite { M } explicitly.`
    );
  }

  return M;
}

/**
 * Derives a sufficient, tight Big-M value for a ">=" linear inequality:
 *   lhs >= rhs  (or terms >= effectiveRhs)
 *
 * When the indicator variable is inactive, the relaxed constraint becomes:
 *   terms >= effectiveRhs - M
 *
 * For the constraint to be trivially satisfied over all domain values x in [lb, ub]:
 *   effectiveRhs - M <= min(terms)  <=>  M >= effectiveRhs - min(terms)
 *
 * Therefore, the safe tight non-negative Big-M is:
 *   M = max(0, effectiveRhs - min(terms))
 *
 * Fails with an actionable error if any variable lacks a required finite bound
 * or if finite arithmetic overflows.
 */
export function deriveBigMForGe(
  lhs: LinExpr,
  rhs: number,
  constraintName: string
): number {
  const effectiveRhs = validateIndicatorExpressionInputs(lhs, rhs, constraintName);
  let minLhs = 0;

  for (const [v, coeff] of lhs.terms) {
    if (coeff === 0) continue;
    let boundVal: number;
    if (coeff > 0) {
      if (!Number.isFinite(v.lb)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite lower bound (required because coefficient ${coeff} is positive in >= constraint). ` +
          `Please set an explicit finite lower bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      boundVal = v.lb;
    } else {
      if (!Number.isFinite(v.ub)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite upper bound (required because coefficient ${coeff} is negative in >= constraint). ` +
          `Please set an explicit finite upper bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      boundVal = v.ub;
    }

    const termMin = coeff * boundVal;
    minLhs += termMin;
    if (!Number.isFinite(termMin) || !Number.isFinite(minLhs)) {
      throw new Error(
        `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
        `numeric overflow while bounding contribution of variable "${v.name}". ` +
        `Please rescale coefficients/bounds or specify a finite { M } explicitly.`
      );
    }
  }

  const rawDiff = effectiveRhs - minLhs;
  if (!Number.isFinite(rawDiff)) {
    throw new Error(
      `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
      `numeric overflow while computing Big-M (${effectiveRhs} - ${minLhs}). ` +
      `Please rescale coefficients/bounds or specify a finite { M } explicitly.`
    );
  }

  const M = Math.max(0, rawDiff);
  if (!Number.isFinite(M) || !Number.isFinite(effectiveRhs - M)) {
    throw new Error(
      `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
      `derived Big-M (${M}) or shifted right-hand side overflows finite floating-point range. ` +
      `Please rescale coefficients/bounds or specify a finite { M } explicitly.`
    );
  }

  return M;
}

/**
 * Constructs the linearized LHS and RHS for a single directional indicator constraint,
 * preserving all non-zero terms (including small magnitudes < 1e-12) and verifying
 * that all resulting coefficients and shifted RHS values remain finite.
 */
export function buildIndicatorLinearization(
  binVar: Var,
  lhs: LinExpr,
  sense: "<=" | ">=",
  rhs: number,
  activeVal: 0 | 1,
  M: number,
  constraintName: string
): { lhs: LinExpr; rhs: number } {
  const isBinaryDomain =
    binVar instanceof Var &&
    (binVar.type === "Binary" ||
      (binVar.type as string) === "BINARY" ||
      ((binVar.type === "Integer" || (binVar.type as string) === "INTEGER") &&
        binVar.lb === 0 &&
        binVar.ub === 1));
  if (!isBinaryDomain) {
    throw new Error(
      `Indicator variable "${binVar?.name ?? String(binVar)}" must be a Binary variable (or Integer variable with bounds [0, 1]), received "${binVar?.type ?? typeof binVar}" with bounds [${binVar?.lb}, ${binVar?.ub}].`
    );
  }
  if (!Number.isFinite(binVar.lb) || !Number.isFinite(binVar.ub) || binVar.lb < 0 || binVar.ub > 1 || binVar.lb > binVar.ub) {
    throw new Error(
      `Binary indicator variable "${binVar.name}" has invalid bounds [${binVar.lb}, ${binVar.ub}]. Binary variables must stay within [0, 1] with lb <= ub.`
    );
  }
  const effectiveRhs = validateIndicatorExpressionInputs(lhs, rhs, constraintName);
  if (activeVal !== 0 && activeVal !== 1) {
    throw new Error(
      `Invalid activeValue: ${activeVal}. Indicator activation value must be 0 or 1.`
    );
  }
  if (sense !== "<=" && sense !== ">=") {
    throw new Error(
      `Invalid indicator sense for "${constraintName}": expected "<=" or ">=", received "${String(sense)}".`
    );
  }
  if (!Number.isFinite(M) || M < 0) {
    throw new Error(
      `Invalid Big-M value for indicator constraint "${constraintName}": expected a finite non-negative number, received ${M}.`
    );
  }
  const existingTriggerCoeff = lhs.terms.get(binVar);
  if (existingTriggerCoeff !== undefined && existingTriggerCoeff !== 0) {
    throw new Error(
      `Indicator constraint "${constraintName}" cannot include its own binary activation variable "${binVar.name}" in the linear expression.`
    );
  }

  let deltaBinCoeff: number;
  let finalRhs: number;

  if (activeVal === 1) {
    if (sense === "<=") {
      // terms + M * binVar <= effectiveRhs + M
      deltaBinCoeff = M;
      finalRhs = effectiveRhs + M;
    } else {
      // terms - M * binVar >= effectiveRhs - M
      deltaBinCoeff = -M;
      finalRhs = effectiveRhs - M;
    }
  } else {
    if (sense === "<=") {
      // terms - M * binVar <= effectiveRhs
      deltaBinCoeff = -M;
      finalRhs = effectiveRhs;
    } else {
      // terms + M * binVar >= effectiveRhs
      deltaBinCoeff = M;
      finalRhs = effectiveRhs;
    }
  }

  if (!Number.isFinite(finalRhs)) {
    throw new Error(
      `Cannot construct finite indicator constraint "${constraintName}": ` +
      `shifted right-hand side overflows finite floating-point range. ` +
      `Please rescale coefficients/bounds or specify a smaller finite { M }.`
    );
  }

  const terms = new Map<Var, number>();
  for (const [v, coeff] of lhs.terms) {
    if (coeff !== 0) {
      terms.set(v, coeff);
    }
  }

  if (deltaBinCoeff !== 0) {
    terms.set(binVar, deltaBinCoeff);
  }

  return {
    lhs: new LinExpr(terms, 0),
    rhs: finalRhs,
  };
}
