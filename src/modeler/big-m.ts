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

interface ExactDecimal {
  num: bigint;
  scale: number; // denominator is 10^scale
}

function parseExactDecimal(n: number): ExactDecimal | null {
  if (!Number.isFinite(n)) return null;
  if (n === 0) return { num: 0n, scale: 0 };
  const s = n.toString();
  const match = /^([+-]?\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!match) return null;
  const intPart = match[1];
  const fracPart = match[2] ?? "";
  const expPart = match[3] ? parseInt(match[3], 10) : 0;
  if (Math.abs(expPart) > 400) return null;
  const digits = intPart + fracPart;
  const rawScale = fracPart.length - expPart;
  if (rawScale >= 0) {
    return { num: BigInt(digits), scale: rawScale };
  }
  return { num: BigInt(digits) * 10n ** BigInt(-rawScale), scale: 0 };
}

function addExactDecimal(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  if (a.scale === b.scale) {
    return { num: a.num + b.num, scale: a.scale };
  }
  if (a.scale < b.scale) {
    const diff = BigInt(b.scale - a.scale);
    return { num: a.num * 10n ** diff + b.num, scale: b.scale };
  }
  const diff = BigInt(a.scale - b.scale);
  return { num: a.num + b.num * 10n ** diff, scale: a.scale };
}

function subExactDecimal(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  return addExactDecimal(a, { num: -b.num, scale: b.scale });
}

function mulExactDecimal(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  return { num: a.num * b.num, scale: a.scale + b.scale };
}

function compareFloatWithExact(f: number, exact: ExactDecimal): number {
  const fDec = parseExactDecimal(f);
  if (!fDec) return 0;
  const diff = subExactDecimal(fDec, exact);
  return diff.num < 0n ? -1 : diff.num > 0n ? 1 : 0;
}

function nextUp(x: number): number {
  if (x === 0) return Number.MIN_VALUE;
  let step = Math.max(Number.MIN_VALUE, Math.abs(x) * (Number.EPSILON / 2));
  while (x + step === x && Number.isFinite(step)) {
    step *= 2;
  }
  return x + step;
}

function nextDown(x: number): number {
  return -nextUp(-x);
}

function exactDecimalToApproxNumber(exact: ExactDecimal): number {
  if (exact.num === 0n) return 0;
  const sign = exact.num < 0n ? "-" : "";
  const absStr = (exact.num < 0n ? -exact.num : exact.num).toString();
  const exp = absStr.length - 1 - exact.scale;
  const mantissa = absStr.length === 1 ? absStr : `${absStr[0]}.${absStr.slice(1)}`;
  return Number(`${sign}${mantissa}e${exp}`);
}

function exactDecimalToNumberCeil(exact: ExactDecimal): number {
  let candidate = exactDecimalToApproxNumber(exact);
  while (Number.isFinite(candidate) && compareFloatWithExact(candidate, exact) < 0) {
    candidate = nextUp(candidate);
  }
  return candidate;
}

function exactDecimalToNumberFloor(exact: ExactDecimal): number {
  let candidate = exactDecimalToApproxNumber(exact);
  while (Number.isFinite(candidate) && compareFloatWithExact(candidate, exact) > 0) {
    candidate = nextDown(candidate);
  }
  return candidate;
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
  let exactMaxLhs: ExactDecimal | null = { num: 0n, scale: 0 };

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
    if (exactMaxLhs !== null) {
      const cDec = parseExactDecimal(coeff);
      const bDec = parseExactDecimal(boundVal);
      exactMaxLhs = cDec && bDec ? addExactDecimal(exactMaxLhs, mulExactDecimal(cDec, bDec)) : null;
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

  let M = Math.max(0, rawDiff);
  const exactRhs = parseExactDecimal(effectiveRhs);
  if (exactMaxLhs && exactRhs) {
    const exactDiff = subExactDecimal(exactMaxLhs, exactRhs);
    if (exactDiff.num > 0n) {
      M = Math.max(M, exactDecimalToNumberCeil(exactDiff));
      const minSum = exactDecimalToNumberCeil(exactMaxLhs);
      if (effectiveRhs + M < minSum) {
        M = Math.max(M, minSum - effectiveRhs);
        while (
          Number.isFinite(M) &&
          Number.isFinite(effectiveRhs + M) &&
          compareFloatWithExact(effectiveRhs + M, exactMaxLhs) < 0
        ) {
          const sum = effectiveRhs + M;
          const sumStep = (nextUp(sum) - sum) / 2;
          M = Math.max(nextUp(M), M + sumStep);
        }
      }
    }
  }
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
  let exactMinLhs: ExactDecimal | null = { num: 0n, scale: 0 };

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
    if (exactMinLhs !== null) {
      const cDec = parseExactDecimal(coeff);
      const bDec = parseExactDecimal(boundVal);
      exactMinLhs = cDec && bDec ? addExactDecimal(exactMinLhs, mulExactDecimal(cDec, bDec)) : null;
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

  let M = Math.max(0, rawDiff);
  const exactRhs = parseExactDecimal(effectiveRhs);
  if (exactMinLhs && exactRhs) {
    const exactDiff = subExactDecimal(exactRhs, exactMinLhs);
    if (exactDiff.num > 0n) {
      M = Math.max(M, exactDecimalToNumberCeil(exactDiff));
      const maxDiff = exactDecimalToNumberFloor(exactMinLhs);
      if (effectiveRhs - M > maxDiff) {
        M = Math.max(M, effectiveRhs - maxDiff);
        while (
          Number.isFinite(M) &&
          Number.isFinite(effectiveRhs - M) &&
          compareFloatWithExact(effectiveRhs - M, exactMinLhs) > 0
        ) {
          const diff = effectiveRhs - M;
          const diffStep = (diff - nextDown(diff)) / 2;
          M = Math.max(nextUp(M), M + diffStep);
        }
      }
    }
  }
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
      const exactEff = parseExactDecimal(effectiveRhs);
      const exactM = parseExactDecimal(M);
      if (exactEff && exactM && M > 0) {
        const target = addExactDecimal(exactEff, exactM);
        finalRhs = Math.max(finalRhs, exactDecimalToNumberCeil(target));
      }
    } else {
      // terms - M * binVar >= effectiveRhs - M
      deltaBinCoeff = -M;
      finalRhs = effectiveRhs - M;
      const exactEff = parseExactDecimal(effectiveRhs);
      const exactM = parseExactDecimal(M);
      if (exactEff && exactM && M > 0) {
        const target = subExactDecimal(exactEff, exactM);
        finalRhs = Math.min(finalRhs, exactDecimalToNumberFloor(target));
      }
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
