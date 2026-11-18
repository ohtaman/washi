import type { Model } from "./model.js";
import { Var } from "./variable.js";
import { BoolVar, BoolOp, GlobalConstraint, type LogicElement } from "./boolean-expr.js";
import { Constraint } from "./constraint.js";
import { LinExpr, type NonlinearTerm, collectAndValidateDiscreteExpr } from "./expression.js";
import { QuadExpr } from "./quad-expr.js";

const varOwner = new WeakMap<Var, Model>();
const constrOwner = new WeakMap<Constraint, Model>();
const topLevelConstrOwner = new WeakMap<Constraint, Model>();

/**
 * Recursively attaches ownerModel mutation tracking to any Constraint nodes embedded in a logical expression.
 */
export function attachLogicElementOwnership(
  elem: LogicElement,
  model: Model,
  undoActions?: (() => void)[]
): void {
  if (elem instanceof BoolOp) {
    for (const child of elem.children) {
      attachLogicElementOwnership(child, model, undoActions);
    }
  } else if (elem instanceof Constraint) {
    const prevOwner = elem.ownerModel;
    const prevMapOwner = constrOwner.get(elem);
    if (prevOwner !== model || prevMapOwner !== model) {
      if (undoActions) {
        undoActions.push(() => {
          elem.ownerModel = prevOwner;
          if (prevMapOwner) {
            constrOwner.set(elem, prevMapOwner);
          } else {
            constrOwner.delete(elem);
          }
        });
      }
      elem.ownerModel = model;
      constrOwner.set(elem, model);
    }
  }
}

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
export function claimConstraintOwnership(c: Constraint, model: Model): Model | undefined {
  const existingTop = topLevelConstrOwner.get(c);
  if (existingTop) {
    throw new Error(
      existingTop === model
        ? `Constraint "${c.name}" is already registered in model "${model.name}".`
        : `Constraint "${c.name}" already belongs to model "${existingTop.name}" and cannot be added to model "${model.name}".`
    );
  }
  const existingAny = constrOwner.get(c);
  if (existingAny && existingAny !== model) {
    throw new Error(
      `Constraint "${c.name}" already belongs to model "${existingAny.name}" and cannot be added to model "${model.name}".`
    );
  }
  topLevelConstrOwner.set(c, model);
  constrOwner.set(c, model);
  return existingAny;
}

/**
 * Releases variable ownership when rolling back a failed batch operation.
 */
export function releaseVarOwnership(v: Var, model: Model): void {
  if (varOwner.get(v) === model) {
    varOwner.delete(v);
  }
}

/**
 * Releases constraint ownership when rolling back a failed batch operation.
 */
export function releaseConstraintOwnership(
  c: Constraint,
  model: Model,
  previousOwner?: Model
): void {
  if (topLevelConstrOwner.get(c) === model) {
    topLevelConstrOwner.delete(c);
  }
  if (constrOwner.get(c) === model) {
    if (previousOwner) {
      constrOwner.set(c, previousOwner);
    } else {
      constrOwner.delete(c);
    }
  }
}

/**
 * Numerical tolerance used when validating variable initial values against bounds and integrality.
 */
export const INITIAL_VALUE_TOLERANCE = 1e-6;

/**
 * Validates lower and upper bounds (and optional primal initialValue) of a single variable.
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

  if (v.initialValue !== undefined) {
    if (typeof v.initialValue !== "number" || !Number.isFinite(v.initialValue)) {
      throw new Error(
        `Variable "${v.name}" has invalid initialValue: ${String(v.initialValue)} (initialValue must be a finite number).`
      );
    }
    const effectiveLb = v.type === "Binary" ? Math.max(0, v.lb) : v.lb;
    const effectiveUb = v.type === "Binary" ? Math.min(1, v.ub) : v.ub;
    if (
      v.initialValue < effectiveLb - INITIAL_VALUE_TOLERANCE ||
      v.initialValue > effectiveUb + INITIAL_VALUE_TOLERANCE
    ) {
      throw new Error(
        `Variable "${v.name}" has initialValue (${v.initialValue}) outside its bounds [${effectiveLb}, ${effectiveUb}] (tolerance ${INITIAL_VALUE_TOLERANCE}).`
      );
    }
    if (v.type === "Integer" || v.type === "Binary") {
      const nearest = Math.round(v.initialValue);
      if (
        Math.abs(v.initialValue - nearest) > INITIAL_VALUE_TOLERANCE ||
        nearest < effectiveLb ||
        nearest > effectiveUb
      ) {
        throw new Error(
          `Variable "${v.name}" of type "${v.type}" has non-integral or out-of-domain initialValue: ${v.initialValue} (must be within ${INITIAL_VALUE_TOLERANCE} of an integer in [${effectiveLb}, ${effectiveUb}]).`
        );
      }
    }
  }
}

/**
 * Validates and normalizes a variable's optional primal initialValue for solver consumption.
 * Rounds near-integer values for Integer/Binary variables and clamps near-bound values for Continuous variables.
 */
export function normalizeVarInitialValue(v: Var): number | undefined {
  if (v.initialValue === undefined) {
    return undefined;
  }
  validateVarBounds(v);
  if (v.type === "Integer" || v.type === "Binary") {
    const rounded = Math.round(v.initialValue);
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  const clamped = Math.min(v.ub, Math.max(v.lb, v.initialValue));
  return Object.is(clamped, -0) ? 0 : clamped;
}

function validateDiscreteVarTypes(
  vars: ReadonlySet<Var> | undefined,
  contextLabel: string
): void {
  if (!vars) return;
  for (const v of vars) {
    if (v.type !== "Integer" && v.type !== "Binary") {
      throw new Error(
        `${contextLabel} requires Integer or Binary variables, but variable "${v.name}" has type "${v.type}".`
      );
    }
  }
}

function validateNonlinearTermsOwnership(
  nonlinearTerms: ReadonlyArray<NonlinearTerm> | undefined,
  contextLabel: string,
  modelName: string,
  isOwnedVar: (v: Var) => boolean
): void {
  if (!nonlinearTerms || nonlinearTerms.length === 0) return;
  for (const nl of nonlinearTerms) {
    if (!Number.isFinite(nl.coeff)) {
      throw new Error(
        `Nonlinear expression in ${contextLabel} has invalid coefficient: ${nl.coeff}. Coefficients must be finite numbers.`
      );
    }
    const atom = nl.atom;
    if (atom.kind === "abs") {
      validateLinExprTree(atom.arg, contextLabel, modelName, isOwnedVar);
    } else if (atom.kind === "max" || atom.kind === "min") {
      for (const arg of atom.args) {
        validateLinExprTree(arg, contextLabel, modelName, isOwnedVar);
      }
    } else if (atom.kind === "at") {
      validateDiscreteVarTypes(atom.discreteVars, `at() index in ${contextLabel}`);
      validateLinExprTree(atom.index, contextLabel, modelName, isOwnedVar);
      for (const elem of atom.array) {
        validateLinExprTree(elem, contextLabel, modelName, isOwnedVar);
      }
    }
  }
}

function validateLinExprTree(
  expr: LinExpr,
  contextLabel: string,
  modelName: string,
  isOwnedVar: (v: Var) => boolean,
  options?: {
    constantPrefix?: string;
    constantKind?: string;
    varLocationPhrase?: string;
  }
): void {
  if (expr.constant !== undefined && !Number.isFinite(expr.constant)) {
    const prefix = options?.constantPrefix ?? contextLabel;
    const kind = options?.constantKind ?? "constant";
    throw new Error(
      `${prefix} has invalid ${kind}: ${expr.constant}. Constant must be a finite number.`
    );
  }
  const locationPhrase = options?.varLocationPhrase ?? `in ${contextLabel}`;
  for (const [v, coeff] of expr.terms) {
    if (!isOwnedVar(v)) {
      throw new Error(
        `Variable "${v.name}" ${locationPhrase} does not belong to model "${modelName}". All variables must belong to the model by object identity.`
      );
    }
    if (!Number.isFinite(coeff)) {
      throw new Error(
        `Variable "${v.name}" in ${contextLabel} has invalid coefficient: ${coeff}. Coefficients must be finite numbers.`
      );
    }
  }
  validateNonlinearTermsOwnership(expr.nonlinearTerms, contextLabel, modelName, isOwnedVar);
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
    validateNonlinearTermsOwnership(expr.nonlinearTerms, "objective function", modelName, isOwnedVar);
  } else if ("terms" in expr) {
    validateLinExprTree(expr, "objective function", modelName, isOwnedVar, {
      constantPrefix: "Objective function",
    });
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
  validateDiscreteVarTypes(c._requiredDiscreteVars, `Discrete constraint "${constrName}"`);
  validateLinExprTree(c.lhs, `constraint "${constrName}"`, modelName, isOwnedVar);
  if (c.sense === "!=") {
    if (!Number.isSafeInteger(c.rhs)) {
      throw new Error(
        `Discrete "!=" in constraint "${constrName}" requires a safe integer RHS, received ${c.rhs}.`
      );
    }
    collectAndValidateDiscreteExpr(c.lhs, `Discrete "!=" in constraint "${constrName}"`);
  }
  if (c._indicatorMeta) {
    const binVar = c._indicatorMeta.binVar;
    if (!isOwnedVar(binVar)) {
      throw new Error(
        `Indicator binary variable "${binVar.name}" in constraint "${constrName}" does not belong to model "${modelName}".`
      );
    }
    const isValidBinary =
      binVar.type === "Binary" ||
      (binVar.type === "Integer" && binVar.lb === 0 && binVar.ub === 1);
    if (!isValidBinary) {
      throw new Error(
        `Indicator variable "${binVar.name}" in constraint "${constrName}" has invalid type "${binVar.type}" or bounds [${binVar.lb}, ${binVar.ub}]: expected Binary or Integer [0, 1].`
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
  isOwnedBoolVar: (bv: BoolVar) => boolean,
  ownerModel?: Model
): void {
  if (elem instanceof BoolVar) {
    if (!isOwnedBoolVar(elem)) {
      throw new Error(
        `Boolean variable "${elem.name}" in logical constraint "${lcName}" does not belong to model "${modelName}".`
      );
    }
  } else if (elem instanceof BoolOp) {
    for (const child of elem.children) {
      validateLogicElement(child, lcName, modelName, isOwnedVar, isOwnedBoolVar, ownerModel);
    }
  } else if (elem instanceof GlobalConstraint) {
    validateDiscreteVarTypes(elem.discreteVars, `Global constraint "${lcName}"`);
    const label = `logical constraint "${lcName}"`;
    switch (elem.spec.kind) {
      case "distinct":
        for (const arg of elem.spec.args) {
          validateLinExprTree(arg, label, modelName, isOwnedVar);
        }
        break;
      case "disjoint":
        for (const task of elem.spec.tasks) {
          validateLinExprTree(task.start, label, modelName, isOwnedVar);
        }
        break;
      case "cumulative":
        for (const task of elem.spec.tasks) {
          validateLinExprTree(task.start, label, modelName, isOwnedVar);
        }
        break;
      case "allowed":
        for (const vExpr of elem.spec.vars) {
          validateLinExprTree(vExpr, label, modelName, isOwnedVar);
        }
        break;
    }
  } else if (elem instanceof Constraint) {
    if (ownerModel) {
      const existingOwner = constrOwner.get(elem) ?? ((elem.ownerModel as Model | null) ?? undefined);
      if (existingOwner && existingOwner !== ownerModel) {
        throw new Error(
          `Constraint "${elem.name}" embedded in logical constraint "${lcName}" already belongs to model "${existingOwner.name ?? "another model"}" and cannot be added to model "${modelName}".`
        );
      }
    }
    if (!Number.isFinite(elem.rhs)) {
      throw new Error(
        `Constraint "${elem.name}" embedded in logical constraint "${lcName}" has invalid RHS: ${elem.rhs}.`
      );
    }
    validateDiscreteVarTypes(
      elem._requiredDiscreteVars,
      `Discrete constraint "${elem.name}" embedded in logical constraint "${lcName}"`
    );
    validateLinExprTree(
      elem.lhs,
      `constraint "${elem.name}" embedded in logical constraint "${lcName}"`,
      modelName,
      isOwnedVar,
      {
        constantPrefix: `Constraint "${elem.name}" embedded in logical constraint "${lcName}"`,
        constantKind: "LHS constant",
        varLocationPhrase: `embedded in logical constraint "${lcName}"`,
      }
    );
    if (elem.sense === "!=") {
      if (!Number.isSafeInteger(elem.rhs)) {
        throw new Error(
          `Discrete "!=" in constraint "${elem.name}" embedded in logical constraint "${lcName}" requires a safe integer RHS, received ${elem.rhs}.`
        );
      }
      collectAndValidateDiscreteExpr(
        elem.lhs,
        `Discrete "!=" in constraint "${elem.name}" embedded in logical constraint "${lcName}"`
      );
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

  for (const lc of model.logicalConstraints) {
    if (model.getLogicalConstraintByName(lc.name) !== lc) {
      throw new Error(
        `Logical constraint "${lc.name}" is duplicated or not canonically registered in model "${model.name}".`
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
      (bv) => registeredBoolVars.has(bv),
      model
    );
  }
}

