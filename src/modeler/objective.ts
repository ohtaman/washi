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
        `Use m.constraint(expr\`... <= ...\`) for constraints, or supply an unconstrained arithmetic expression to ${fnName}(), e.g. m.objective(${fnName}(expr\`30 * \${x}\`)).`
    );
  }
  if (typeof raw === "string" && /(<=|>=|==|=<|=>|=)/.test(raw)) {
    throw new Error(
      `Cannot use a comparison constraint as an objective in ${fnName}(). ` +
        `Use m.constraint(expr\`... <= ...\`) for constraints, or supply an unconstrained arithmetic expression to ${fnName}(), e.g. m.objective(${fnName}(expr\`30 * \${x}\`)).`
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
      (("terms" in raw &&
        (raw as { terms: unknown }).terms instanceof Map &&
        typeof (raw as { constant?: unknown }).constant === "number") ||
        ("quadTerms" in raw &&
          (raw as { quadTerms: unknown }).quadTerms instanceof Map &&
          "linearTerms" in raw &&
          (raw as { linearTerms: unknown }).linearTerms instanceof Map &&
          typeof (raw as { constant?: unknown }).constant === "number") ||
        ("id" in raw && "name" in raw && "lb" in raw && "ub" in raw)))
  ) {
    return raw as ObjectiveExpr;
  }
  throw new Error(
    `Invalid expression passed to ${fnName}(): expected a finite number, Var, LinExpr, QuadExpr, or arithmetic expression string.`
  );
}

/**
 * Create a maximization objective specification (`sense: "Maximize"`) for `m.objective(...)`.
 *
 * Accepts a linear expression (`LinExpr`, `Var`, finite `number`, or formula string) or a
 * quadratic objective expression (`QuadExpr` using `^2` or `${x} * ${y}`).
 *
 * **Solver & formulation notes**:
 * - Quadratic terms (`^2`, variable-by-variable products) are supported in **objectives only**
 *   (requires a QP-capable solver such as the default HiGHS; throws on GLPK and Z3).
 * - Passing a comparison `Constraint` (`<=`, `>=`, `==`) throws an Error.
 *
 * @example
 * ```ts
 * const m = new Model("Production");
 * const chairs = m.integer("chairs", { lb: 0 });
 * const tables = m.integer("tables", { lb: 0 });
 * m.objective(maximize(expr`30 * ${chairs} + 50 * ${tables}`));
 * ```
 */
export function maximize(expr: ObjectiveExpr | Constraint): ObjectiveSpec {
  return {
    expr: validateObjectiveConstructorInput(expr, "maximize"),
    sense: "Maximize",
  };
}

/**
 * Create a minimization objective specification (`sense: "Minimize"`) for `m.objective(...)`.
 *
 * Accepts a linear expression (`LinExpr`, `Var`, finite `number`, or formula string) or a
 * convex quadratic objective expression (`QuadExpr` using `^2` or `${x} * ${y}`).
 *
 * **Solver & formulation notes**:
 * - Quadratic terms (`^2`, variable-by-variable products) are supported in **objectives only**
 *   (requires a QP-capable solver such as the default HiGHS; throws on GLPK and Z3).
 * - Passing a comparison `Constraint` (`<=`, `>=`, `==`) throws an Error.
 *
 * @example
 * ```ts
 * const m = new Model("PortfolioQP");
 * const x = m.continuous("x", { lb: 0 });
 * const y = m.continuous("y", { lb: 0 });
 * // Linear or convex quadratic objective (quadratic terms are allowed in objectives only)
 * m.objective(minimize(expr`${x}^2 + 2 * ${x} * ${y} + 2 * ${y}^2`));
 * ```
 */
export function minimize(expr: ObjectiveExpr | Constraint): ObjectiveSpec {
  return {
    expr: validateObjectiveConstructorInput(expr, "minimize"),
    sense: "Minimize",
  };
}


