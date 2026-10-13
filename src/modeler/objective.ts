import type { LinExpr } from "./expression.js";
import type { QuadExpr } from "./quad-expr.js";
import type { Var } from "./variable.js";
import type { OptimizationSense } from "./types.js";

/**
 * Valid expressions that can form an objective function.
 * Note that Constraint is strictly excluded.
 */
export type ObjectiveExpr = LinExpr | QuadExpr | Var | number | string;

/**
 * Specification of an objective function and its optimization direction (sense).
 */
export interface ObjectiveSpec {
  expr: ObjectiveExpr;
  sense: OptimizationSense;
}

/**
 * Define an objective function to MAXIMIZE:
 * ```typescript
 * model.objective(maximize(expr`30 * ${chairs} + 50 * ${tables}`));
 * ```
 */
export function maximize(expr: ObjectiveExpr): ObjectiveSpec {
  return { expr, sense: "Maximize" };
}

/**
 * Define an objective function to MINIMIZE:
 * ```typescript
 * model.objective(minimize(expr`2 * ${x} + 3 * ${y}`));
 * ```
 */
export function minimize(expr: ObjectiveExpr): ObjectiveSpec {
  return { expr, sense: "Minimize" };
}
