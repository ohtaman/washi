import { LinExpr } from "./expression.js";
import { QuadExpr } from "./quad-expr.js";
import { Var } from "./variable.js";
import { Constraint } from "./constraint.js";
import type { OptimizationSense } from "./types.js";

/**
 * Valid expressions that can form an objective function.
 * Note that Constraint is strictly excluded at runtime.
 */
export type ObjectiveExpr = LinExpr | QuadExpr | Var | number | string;

/**
 * Specification of an objective function and its optimization direction (sense).
 */
export interface ObjectiveSpec {
  expr: ObjectiveExpr | Constraint;
  sense: OptimizationSense;
}

function validateObjectiveConstructorInput(
  expr: ObjectiveExpr | Constraint,
  fnName: "maximize" | "minimize"
): ObjectiveExpr {
  const raw = expr as unknown;
  if (
    raw instanceof Constraint ||
    (typeof raw === "object" &&
      raw !== null &&
      "sense" in raw &&
      "lhs" in raw &&
      "rhs" in raw)
  ) {
    throw new Error(
      `Cannot use a Constraint as an objective in ${fnName}(). ` +
        `Use model.constraint(expr\`... <= ...\`) for constraints, or supply an unconstrained arithmetic expression to ${fnName}().`
    );
  }
  if (typeof raw === "string" && /(<=|>=|==|=<|=>|=)/.test(raw)) {
    throw new Error(
      `Cannot use a comparison constraint as an objective in ${fnName}(). ` +
        `Use model.constraint(expr\`... <= ...\`) for constraints, or supply an unconstrained arithmetic expression to ${fnName}().`
    );
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      throw new Error(
        `Invalid non-finite objective constant "${raw}" passed to ${fnName}().`
      );
    }
    return raw;
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (
    raw instanceof LinExpr ||
    raw instanceof QuadExpr ||
    raw instanceof Var ||
    (typeof raw === "object" &&
      raw !== null &&
      (("terms" in raw && (raw as { terms: unknown }).terms instanceof Map) ||
        ("quadTerms" in raw && (raw as { quadTerms: unknown }).quadTerms instanceof Map) ||
        ("id" in raw && "name" in raw && "lb" in raw && "ub" in raw)))
  ) {
    return raw as ObjectiveExpr;
  }
  throw new Error(
    `Invalid expression passed to ${fnName}(): expected a finite number, Var, LinExpr, QuadExpr, or arithmetic expression string.`
  );
}

/**
 * Define an objective function to MAXIMIZE:
 * ```typescript
 * model.objective(maximize(expr`30 * ${chairs} + 50 * ${tables}`));
 * ```
 */
export function maximize(expr: ObjectiveExpr | Constraint): ObjectiveSpec {
  return {
    expr: validateObjectiveConstructorInput(expr, "maximize"),
    sense: "Maximize",
  };
}

/**
 * Define an objective function to MINIMIZE:
 * ```typescript
 * model.objective(minimize(expr`2 * ${x} + 3 * ${y}`));
 * ```
 */
export function minimize(expr: ObjectiveExpr | Constraint): ObjectiveSpec {
  return {
    expr: validateObjectiveConstructorInput(expr, "minimize"),
    sense: "Minimize",
  };
}

