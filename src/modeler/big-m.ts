import type { LinExpr } from "./expression.js";
import type { Var } from "./variable.js";

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
 * Fails with an actionable error if any variable lacks a required finite bound.
 */
export function deriveBigMForLe(
  lhs: LinExpr,
  rhs: number,
  constraintName: string
): number {
  const effectiveRhs = rhs - (lhs.constant || 0);
  let maxLhs = 0;

  for (const [v, coeff] of lhs.terms) {
    if (Math.abs(coeff) < 1e-12) continue;
    if (coeff > 0) {
      if (!Number.isFinite(v.ub)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite upper bound (required because coefficient ${coeff} is positive in <= constraint). ` +
          `Please set an explicit finite upper bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      maxLhs += coeff * v.ub;
    } else {
      if (!Number.isFinite(v.lb)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite lower bound (required because coefficient ${coeff} is negative in <= constraint). ` +
          `Please set an explicit finite lower bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      maxLhs += coeff * v.lb;
    }
  }

  return Math.max(0, maxLhs - effectiveRhs);
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
 * Fails with an actionable error if any variable lacks a required finite bound.
 */
export function deriveBigMForGe(
  lhs: LinExpr,
  rhs: number,
  constraintName: string
): number {
  const effectiveRhs = rhs - (lhs.constant || 0);
  let minLhs = 0;

  for (const [v, coeff] of lhs.terms) {
    if (Math.abs(coeff) < 1e-12) continue;
    if (coeff > 0) {
      if (!Number.isFinite(v.lb)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite lower bound (required because coefficient ${coeff} is positive in >= constraint). ` +
          `Please set an explicit finite lower bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      minLhs += coeff * v.lb;
    } else {
      if (!Number.isFinite(v.ub)) {
        throw new Error(
          `Cannot derive safe Big-M for indicator constraint "${constraintName}": ` +
          `variable "${v.name}" lacks a finite upper bound (required because coefficient ${coeff} is negative in >= constraint). ` +
          `Please set an explicit finite upper bound on the variable or specify { M } explicitly in indicator options.`
        );
      }
      minLhs += coeff * v.ub;
    }
  }

  return Math.max(0, effectiveRhs - minLhs);
}
