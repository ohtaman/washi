import type { Model } from "./model.js";
import { Var } from "./variable.js";
import { BoolVar, BoolExpr, BoolOp, type LogicElement } from "./boolean-expr.js";
import { Constraint } from "./constraint.js";
import { QuadExpr } from "./quad-expr.js";

/**
 * Validates the structural and numerical integrity of an optimization model.
 *
 * Verifies:
 * 1. Variable bounds: no NaN, valid infinities, and lb <= ub.
 * 2. Model ownership: all variables in objectives, arithmetic constraints,
 *    and logical constraints belong to this model by object identity.
 * 3. Numeric inputs: coefficients and right-hand side (RHS) values are finite numbers.
 * 4. Constraint identity: unique constraint names across arithmetic and logical constraints.
 *
 * Throws an Error with actionable context if any validation fails.
 */
export function validateModelIntegrity(model: Model): void {
  // 1. Validate variable bounds
  for (const v of model.variables) {
    if (typeof v.lb !== "number" || Number.isNaN(v.lb)) {
      throw new Error(
        `Variable "${v.name}" has invalid lower bound: ${v.lb} (NaN or non-numeric bound is not allowed).`
      );
    }
    if (v.lb === Infinity) {
      throw new Error(
        `Variable "${v.name}" has invalid lower bound: +Infinity is not allowed as a lower bound.`
      );
    }
    if (typeof v.ub !== "number" || Number.isNaN(v.ub)) {
      throw new Error(
        `Variable "${v.name}" has invalid upper bound: ${v.ub} (NaN or non-numeric bound is not allowed).`
      );
    }
    if (v.ub === -Infinity) {
      throw new Error(
        `Variable "${v.name}" has invalid upper bound: -Infinity is not allowed as an upper bound.`
      );
    }
    if (v.lb > v.ub) {
      throw new Error(
        `Variable "${v.name}" has invalid bounds: lower bound (${v.lb}) is strictly greater than upper bound (${v.ub}).`
      );
    }
  }

  // 2. Validate constraint name uniqueness across arithmetic and logical constraints
  const constraintNames = new Set<string>();
  for (const c of model.constraints) {
    if (constraintNames.has(c.name)) {
      throw new Error(
        `Duplicate constraint name "${c.name}" in model "${model.name}".`
      );
    }
    constraintNames.add(c.name);
  }

  for (const lc of model.logicalConstraints) {
    if (constraintNames.has(lc.name)) {
      throw new Error(
        `Conflicting constraint name "${lc.name}" across arithmetic and logical constraints in model "${model.name}".`
      );
    }
    constraintNames.add(lc.name);
  }

  // 3. Model ownership & coefficients in objective
  const registeredVars = new Set<Var>(model.variables);

  if (model.objectiveExpr) {
    if (model.objectiveExpr instanceof QuadExpr) {
      if (!Number.isFinite(model.objectiveExpr.constant)) {
        throw new Error(
          `Objective function has invalid constant: ${model.objectiveExpr.constant}. Constant must be a finite number.`
        );
      }
      for (const [v, coeff] of model.objectiveExpr.linearTerms) {
        if (!registeredVars.has(v)) {
          throw new Error(
            `Variable "${v.name}" in objective function does not belong to model "${model.name}". All variables must belong to the model by object identity.`
          );
        }
        if (!Number.isFinite(coeff)) {
          throw new Error(
            `Variable "${v.name}" in objective function has invalid coefficient: ${coeff}. Coefficients must be finite numbers.`
          );
        }
      }
      for (const [, term] of model.objectiveExpr.quadTerms) {
        if (!registeredVars.has(term.var1)) {
          throw new Error(
            `Variable "${term.var1.name}" in quadratic objective function does not belong to model "${model.name}". All variables must belong to the model by object identity.`
          );
        }
        if (!registeredVars.has(term.var2)) {
          throw new Error(
            `Variable "${term.var2.name}" in quadratic objective function does not belong to model "${model.name}". All variables must belong to the model by object identity.`
          );
        }
        if (!Number.isFinite(term.coeff)) {
          throw new Error(
            `Quadratic term (${term.var1.name} * ${term.var2.name}) in objective function has invalid coefficient: ${term.coeff}.`
          );
        }
      }
    } else if ("terms" in model.objectiveExpr) {
      // LinExpr
      if (!Number.isFinite(model.objectiveExpr.constant)) {
        throw new Error(
          `Objective function has invalid constant: ${model.objectiveExpr.constant}. Constant must be a finite number.`
        );
      }
      for (const [v, coeff] of model.objectiveExpr.terms) {
        if (!registeredVars.has(v)) {
          throw new Error(
            `Variable "${v.name}" in objective function does not belong to model "${model.name}". All variables must belong to the model by object identity.`
          );
        }
        if (!Number.isFinite(coeff)) {
          throw new Error(
            `Variable "${v.name}" in objective function has invalid coefficient: ${coeff}. Coefficients must be finite numbers.`
          );
        }
      }
    }
  }

  // 4. Model ownership & numerical inputs in arithmetic constraints
  for (const c of model.constraints) {
    if (!Number.isFinite(c.rhs)) {
      throw new Error(
        `Constraint "${c.name}" has invalid right-hand side (RHS): ${c.rhs}. RHS must be a finite number.`
      );
    }
    if (c.lhs.constant !== undefined && !Number.isFinite(c.lhs.constant)) {
      throw new Error(
        `Constraint "${c.name}" has invalid LHS constant: ${c.lhs.constant}. Constant must be a finite number.`
      );
    }
    for (const [v, coeff] of c.lhs.terms) {
      if (!registeredVars.has(v)) {
        throw new Error(
          `Variable "${v.name}" in constraint "${c.name}" does not belong to model "${model.name}". All variables must belong to the model by object identity.`
        );
      }
      if (!Number.isFinite(coeff)) {
        throw new Error(
          `Variable "${v.name}" in constraint "${c.name}" has invalid coefficient: ${coeff}. Coefficients must be finite numbers.`
        );
      }
    }
  }

  // 5. Model ownership in logical constraints
  const registeredBoolVars = new Set<BoolVar>(model.boolVars);

  function traverseLogic(elem: LogicElement, lcName: string): void {
    if (elem instanceof BoolVar) {
      if (!registeredBoolVars.has(elem)) {
        throw new Error(
          `Boolean variable "${elem.name}" in logical constraint "${lcName}" does not belong to model "${model.name}".`
        );
      }
    } else if (elem instanceof BoolOp) {
      for (const child of elem.children) {
        traverseLogic(child, lcName);
      }
    } else if (elem instanceof Constraint) {
      if (!Number.isFinite(elem.rhs)) {
        throw new Error(
          `Constraint "${elem.name}" embedded in logical constraint "${lcName}" has invalid RHS: ${elem.rhs}.`
        );
      }
      if (elem.lhs.constant !== undefined && !Number.isFinite(elem.lhs.constant)) {
        throw new Error(
          `Constraint "${elem.name}" embedded in logical constraint "${lcName}" has invalid LHS constant: ${elem.lhs.constant}.`
        );
      }
      for (const [v, coeff] of elem.lhs.terms) {
        if (!registeredVars.has(v)) {
          throw new Error(
            `Variable "${v.name}" embedded in logical constraint "${lcName}" does not belong to model "${model.name}".`
          );
        }
        if (!Number.isFinite(coeff)) {
          throw new Error(
            `Variable "${v.name}" embedded in logical constraint "${lcName}" has invalid coefficient: ${coeff}.`
          );
        }
      }
    }
  }

  for (const lc of model.logicalConstraints) {
    traverseLogic(lc.expr, lc.name);
  }
}
