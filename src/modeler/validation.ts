import type { Model } from "./model.js";
import { Var } from "./variable.js";
import { BoolVar, BoolExpr, BoolOp, type LogicElement } from "./boolean-expr.js";
import { Constraint } from "./constraint.js";
import { LinExpr } from "./expression.js";
import { QuadExpr } from "./quad-expr.js";

const varOwner = new WeakMap<Var, Model>();
const constrOwner = new WeakMap<Constraint, Model>();

/**
 * Associates a variable instance with its owning model and rejects cross-model sharing.
 */
export function claimVarOwnership(v: Var, model: Model): void {
  const existing = varOwner.get(v);
  if (existing && existing !== model) {
    throw new Error(
      `Variable "${v.name}" already belongs to model "${existing.name}" and cannot be added to model "${model.name}".`
    );
  }
  varOwner.set(v, model);
}

/**
 * Associates a constraint instance with its owning model and rejects reusing or cross-model sharing.
 */
export function claimConstraintOwnership(c: Constraint, model: Model): void {
  const existing = constrOwner.get(c);
  if (existing) {
    throw new Error(
      existing === model
        ? `Constraint "${c.name}" is already registered in model "${model.name}".`
        : `Constraint "${c.name}" already belongs to model "${existing.name}" and cannot be added to model "${model.name}".`
    );
  }
  constrOwner.set(c, model);
}

/**
 * Validates lower and upper bounds of a single variable.
 */
export function validateVarBounds(v: Var): void {
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

/**
 * Validates objective expression constants, coefficients, and variable ownership.
 */
export function validateObjectiveExpr(
  expr: LinExpr | QuadExpr,
  modelName: string,
  isOwnedVar: (v: Var) => boolean
): void {
  if (expr instanceof QuadExpr) {
    if (!Number.isFinite(expr.constant)) {
      throw new Error(
        `Objective function has invalid constant: ${expr.constant}. Constant must be a finite number.`
      );
    }
    for (const [v, coeff] of expr.linearTerms) {
      if (!isOwnedVar(v)) {
        throw new Error(
          `Variable "${v.name}" in objective function does not belong to model "${modelName}". All variables must belong to the model by object identity.`
        );
      }
      if (!Number.isFinite(coeff)) {
        throw new Error(
          `Variable "${v.name}" in objective function has invalid coefficient: ${coeff}. Coefficients must be finite numbers.`
        );
      }
    }
    for (const [, term] of expr.quadTerms) {
      if (!isOwnedVar(term.var1)) {
        throw new Error(
          `Variable "${term.var1.name}" in quadratic objective function does not belong to model "${modelName}". All variables must belong to the model by object identity.`
        );
      }
      if (!isOwnedVar(term.var2)) {
        throw new Error(
          `Variable "${term.var2.name}" in quadratic objective function does not belong to model "${modelName}". All variables must belong to the model by object identity.`
        );
      }
      if (!Number.isFinite(term.coeff) || !Number.isFinite(term.coeff * 2)) {
        throw new Error(
          `Quadratic term (${term.var1.name} * ${term.var2.name}) in objective function has invalid coefficient: ${term.coeff}.`
        );
      }
    }
  } else if ("terms" in expr) {
    if (!Number.isFinite(expr.constant)) {
      throw new Error(
        `Objective function has invalid constant: ${expr.constant}. Constant must be a finite number.`
      );
    }
    for (const [v, coeff] of expr.terms) {
      if (!isOwnedVar(v)) {
        throw new Error(
          `Variable "${v.name}" in objective function does not belong to model "${modelName}". All variables must belong to the model by object identity.`
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

/**
 * Validates a linear constraint's RHS, LHS constant, coefficients, and variable ownership.
 */
export function validateLinearConstraint(
  c: Constraint,
  modelName: string,
  isOwnedVar: (v: Var) => boolean,
  constrName = c.name
): void {
  if (!Number.isFinite(c.rhs)) {
    throw new Error(
      `Constraint "${constrName}" has invalid right-hand side (RHS): ${c.rhs}. RHS must be a finite number.`
    );
  }
  if (c.lhs.constant !== undefined && !Number.isFinite(c.lhs.constant)) {
    throw new Error(
      `Constraint "${constrName}" has invalid LHS constant: ${c.lhs.constant}. Constant must be a finite number.`
    );
  }
  for (const [v, coeff] of c.lhs.terms) {
    if (!isOwnedVar(v)) {
      throw new Error(
        `Variable "${v.name}" in constraint "${constrName}" does not belong to model "${modelName}". All variables must belong to the model by object identity.`
      );
    }
    if (!Number.isFinite(coeff)) {
      throw new Error(
        `Variable "${v.name}" in constraint "${constrName}" has invalid coefficient: ${coeff}. Coefficients must be finite numbers.`
      );
    }
  }
}

/**
 * Validates a logical constraint element recursively.
 */
export function validateLogicElement(
  elem: LogicElement,
  lcName: string,
  modelName: string,
  isOwnedVar: (v: Var) => boolean,
  isOwnedBoolVar: (bv: BoolVar) => boolean
): void {
  if (elem instanceof BoolVar) {
    if (!isOwnedBoolVar(elem)) {
      throw new Error(
        `Boolean variable "${elem.name}" in logical constraint "${lcName}" does not belong to model "${modelName}".`
      );
    }
  } else if (elem instanceof BoolOp) {
    for (const child of elem.children) {
      validateLogicElement(child, lcName, modelName, isOwnedVar, isOwnedBoolVar);
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
      if (!isOwnedVar(v)) {
        throw new Error(
          `Variable "${v.name}" embedded in logical constraint "${lcName}" does not belong to model "${modelName}".`
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

/**
 * Validates the structural and numerical integrity of an optimization model.
 */
export function validateModelIntegrity(model: Model): void {
  // 1. Validate variable bounds, uniqueness, and canonical model registration
  const varNames = new Set<string>();
  const registeredVars = new Set<Var>();
  for (const v of model.variables) {
    validateVarBounds(v);
    const owner = varOwner.get(v);
    if ((owner && owner !== model) || varNames.has(v.name) || model.getVarByName(v.name) !== v) {
      throw new Error(
        `Variable "${v.name}" is duplicated or not canonically registered in model "${model.name}".`
      );
    }
    varNames.add(v.name);
    registeredVars.add(v);
  }

  // 2. Validate Boolean variable uniqueness and canonical registration
  const boolVarNames = new Set<string>();
  const registeredBoolVars = new Set<BoolVar>();
  for (const bv of model.boolVars) {
    if (boolVarNames.has(bv.name) || model.getBoolVarByName(bv.name) !== bv) {
      throw new Error(
        `Boolean variable "${bv.name}" is duplicated or not canonically registered in model "${model.name}".`
      );
    }
    boolVarNames.add(bv.name);
    registeredBoolVars.add(bv);
  }

  // 3. Validate constraint name uniqueness across arithmetic, logical constraints, and Boolean variables
  const constraintNames = new Set<string>();
  for (const c of model.constraints) {
    if (boolVarNames.has(c.name)) {
      throw new Error(
        `Constraint name "${c.name}" conflicts with Boolean variable "${c.name}" in model "${model.name}".`
      );
    }
    if (constraintNames.has(c.name)) {
      throw new Error(
        `Duplicate constraint name "${c.name}" in model "${model.name}".`
      );
    }
    constraintNames.add(c.name);
  }

  for (const lc of model.logicalConstraints) {
    if (boolVarNames.has(lc.name)) {
      throw new Error(
        `Logical constraint name "${lc.name}" conflicts with Boolean variable "${lc.name}" in model "${model.name}".`
      );
    }
    if (constraintNames.has(lc.name)) {
      throw new Error(
        `Conflicting constraint name "${lc.name}" across arithmetic and logical constraints in model "${model.name}".`
      );
    }
    constraintNames.add(lc.name);
  }

  for (const c of model.constraints) {
    const cOwner = constrOwner.get(c);
    if ((cOwner && cOwner !== model) || model.getConstraintByName(c.name) !== c) {
      throw new Error(
        `Constraint "${c.name}" is duplicated or not canonically registered in model "${model.name}".`
      );
    }
  }

  // 4. Model ownership & coefficients in objective
  if (model.objectiveExpr) {
    validateObjectiveExpr(model.objectiveExpr, model.name, (v) => registeredVars.has(v));
  }

  // 5. Model ownership & numerical inputs in arithmetic constraints
  for (const c of model.constraints) {
    validateLinearConstraint(c, model.name, (v) => registeredVars.has(v));
  }

  // 6. Model ownership in logical constraints
  for (const lc of model.logicalConstraints) {
    validateLogicElement(
      lc.expr,
      lc.name,
      model.name,
      (v) => registeredVars.has(v),
      (bv) => registeredBoolVars.has(bv)
    );
  }
}

