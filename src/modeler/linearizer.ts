import { Constraint } from "./constraint.js";
import { LinExpr } from "./expression.js";
import { Var } from "./variable.js";
import { BoolVar, BoolOp, type LogicElement } from "./boolean-expr.js";
import { buildIndicatorLinearization, deriveBigMForLe, deriveBigMForGe } from "./big-m.js";
import type { LogicalConstraintItem } from "./solvers/types.js";

function linExpr(terms: [Var, number][], constant: number = 0): LinExpr {
  return new LinExpr(new Map(terms), constant);
}

export interface LinearizationResult {
  variables: Var[];
  constraints: Constraint[];
  boolVarToBinary: Map<BoolVar, Var>;
  constraintToOriginalName: Map<Constraint, string>;
}

/**
 * Linearizes logical constraints (BoolVar, BoolOp) into MIP binary variables and linear constraints.
 */
export function linearizeModelForMip(
  baseVariables: Var[],
  boolVars: BoolVar[],
  baseConstraints: Constraint[],
  logicalConstraints: LogicalConstraintItem[]
): LinearizationResult {
  const variables = [...baseVariables];
  const constraints = [...baseConstraints];
  const boolVarToBinary = new Map<BoolVar, Var>();
  const constraintToOriginalName = new Map<Constraint, string>();

  // Map each base constraint to its original name
  for (const c of baseConstraints) {
    constraintToOriginalName.set(c, c.name);
  }

  // Set of existing variable names to avoid collisions
  const existingVarNames = new Set<string>(baseVariables.map((v) => v.name));

  let auxCounter = 0;
  function getUniqueAuxName(prefix: string): string {
    let name: string;
    do {
      name = `__washi_${prefix}_${++auxCounter}`;
    } while (existingVarNames.has(name));
    existingVarNames.add(name);
    return name;
  }

  // 1. Create a binary Var for each BoolVar
  for (const bv of boolVars) {
    let varName = bv.name;
    if (existingVarNames.has(varName)) {
      varName = getUniqueAuxName(`bool_${bv.name}`);
    } else {
      existingVarNames.add(varName);
    }
    const binVar = new Var({ name: varName, type: "Binary", lb: 0, ub: 1 });
    boolVarToBinary.set(bv, binVar);
    variables.push(binVar);
  }

  function getBinVarForBoolElement(el: LogicElement, originalName: string): Var {
    if (el instanceof BoolVarWrapper) {
      return el.wrappedVar;
    }
    if (el instanceof BoolVar) {
      const v = boolVarToBinary.get(el);
      if (!v) {
        throw new Error(`Unregistered BoolVar "${el.name}" in logical constraint "${originalName}".`);
      }
      return v;
    }
    // If it's a compound BoolOp, create an aux binary variable and enforce equivalence
    const auxVar = new Var({ name: getUniqueAuxName("expr"), type: "Binary", lb: 0, ub: 1 });
    variables.push(auxVar);
    linearizeElementEquivalence(auxVar, el, originalName);
    return auxVar;
  }

  function linearizeBinaryXorEquivalence(outBin: Var, aBin: Var, bBin: Var, origName: string): void {
    // outBin <=> (a ^ b)
    // outBin <= a + b
    // outBin >= a - b
    // outBin >= b - a
    // outBin <= 2 - a - b
    const c1 = new Constraint(linExpr([[outBin, 1], [aBin, -1], [bBin, -1]], 0), "<=", 0, `${origName}_xor_1`);
    const c2 = new Constraint(linExpr([[outBin, 1], [aBin, -1], [bBin, 1]], 0), ">=", 0, `${origName}_xor_2`);
    const c3 = new Constraint(linExpr([[outBin, 1], [bBin, -1], [aBin, 1]], 0), ">=", 0, `${origName}_xor_3`);
    const c4 = new Constraint(linExpr([[outBin, 1], [aBin, 1], [bBin, 1]], 0), "<=", 2, `${origName}_xor_4`);
    constraints.push(c1, c2, c3, c4);
    constraintToOriginalName.set(c1, origName);
    constraintToOriginalName.set(c2, origName);
    constraintToOriginalName.set(c3, origName);
    constraintToOriginalName.set(c4, origName);
  }

  function linearizeElementEquivalence(binVar: Var, el: LogicElement, originalName: string): void {
    if (el instanceof BoolVar) {
      const targetBin = boolVarToBinary.get(el)!;
      // binVar == targetBin  <=>  binVar - targetBin == 0
      const c = new Constraint(linExpr([[binVar, 1], [targetBin, -1]], 0), "==", 0, `${originalName}_equiv`);
      constraints.push(c);
      constraintToOriginalName.set(c, originalName);
      return;
    }

    if (el instanceof Constraint) {
      // binVar <=> el: (binVar == 0 => not(el)) and (binVar == 1 => el)
      linearizeNegatedConstraint(binVar, el, 0, `${originalName}_c_neg`, originalName);
      linearizeIndicator(binVar, el, 1, `${originalName}_c_pos`, originalName);
      return;
    }

    if (el instanceof BoolOp) {
      if (el.op === "not") {
        const childBin = getBinVarForBoolElement(el.children[0], originalName);
        // binVar == 1 - childBin  <=>  binVar + childBin == 1
        const c = new Constraint(linExpr([[binVar, 1], [childBin, 1]], 0), "==", 1, `${originalName}_not`);
        constraints.push(c);
        constraintToOriginalName.set(c, originalName);
        return;
      }

      if (el.op === "and") {
        const childBins = el.children.map((child) => getBinVarForBoolElement(child, originalName));
        // binVar <= childBin_i  for all i
        for (let i = 0; i < childBins.length; i++) {
          const c = new Constraint(linExpr([[binVar, 1], [childBins[i], -1]], 0), "<=", 0, `${originalName}_and_ub_${i}`);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
        }
        // binVar >= sum(childBin_i) - (n - 1)  <=>  binVar - sum(childBin_i) >= 1 - n
        const terms: [Var, number][] = [[binVar, 1], ...childBins.map((cb): [Var, number] => [cb, -1])];
        const c = new Constraint(linExpr(terms, 0), ">=", 1 - childBins.length, `${originalName}_and_lb`);
        constraints.push(c);
        constraintToOriginalName.set(c, originalName);
        return;
      }

      if (el.op === "or") {
        const childBins = el.children.map((child) => getBinVarForBoolElement(child, originalName));
        // binVar >= childBin_i  for all i  <=>  binVar - childBin_i >= 0
        for (let i = 0; i < childBins.length; i++) {
          const c = new Constraint(linExpr([[binVar, 1], [childBins[i], -1]], 0), ">=", 0, `${originalName}_or_lb_${i}`);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
        }
        // binVar <= sum(childBin_i)  <=>  binVar - sum(childBin_i) <= 0
        const terms: [Var, number][] = [[binVar, 1], ...childBins.map((cb): [Var, number] => [cb, -1])];
        const c = new Constraint(linExpr(terms, 0), "<=", 0, `${originalName}_or_ub`);
        constraints.push(c);
        constraintToOriginalName.set(c, originalName);
        return;
      }

      if (el.op === "implies") {
        const aBin = getBinVarForBoolElement(el.children[0], originalName);
        const bBin = getBinVarForBoolElement(el.children[1], originalName);
        // binVar <=> (a => b)  <=>  binVar <=> (~a or b)
        // binVar >= b - a  <=>  binVar - b + a >= 0
        // binVar <= 1 - a + b
        const c1 = new Constraint(linExpr([[binVar, 1], [bBin, -1], [aBin, 1]], 0), ">=", 0, `${originalName}_imp_1`);
        const c2 = new Constraint(linExpr([[binVar, 1], [aBin, 1], [bBin, -1]], 0), "<=", 1, `${originalName}_imp_2`);
        constraints.push(c1, c2);
        constraintToOriginalName.set(c1, originalName);
        constraintToOriginalName.set(c2, originalName);
        return;
      }

      if (el.op === "xor") {
        if (el.children.length === 0) {
          const c = new Constraint(linExpr([[binVar, 1]], 0), "==", 0, `${originalName}_xor_empty`);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
          return;
        }
        if (el.children.length === 1) {
          const childBin = getBinVarForBoolElement(el.children[0], originalName);
          const c = new Constraint(linExpr([[binVar, 1], [childBin, -1]], 0), "==", 0, `${originalName}_xor_single`);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
          return;
        }
        const childBins = el.children.map((c) => getBinVarForBoolElement(c, originalName));
        let currentBin = childBins[0];
        for (let i = 1; i < childBins.length - 1; i++) {
          const nextAux = new Var({ name: getUniqueAuxName(`xor_fold_${i}`), type: "Binary", lb: 0, ub: 1 });
          variables.push(nextAux);
          linearizeBinaryXorEquivalence(nextAux, currentBin, childBins[i], `${originalName}_xor_fold_${i}`);
          currentBin = nextAux;
        }
        linearizeBinaryXorEquivalence(binVar, currentBin, childBins[childBins.length - 1], originalName);
        return;
      }
    }

    throw new Error(`Unsupported logical element in equivalence linearization: ${el}`);
  }

  // 2. Linearize each top-level logical constraint
  for (const item of logicalConstraints) {
    const origName = item.name;
    const el = item.expr;

    linearizeTopLevelElement(el, origName);
  }

  function linearizeTopLevelElement(el: LogicElement, originalName: string): void {
    if (el instanceof Constraint) {
      linearizeTopLevelConstraint(el, originalName);
      return;
    }

    // Case A: Pure BoolVar: el == true  <=>  binVar >= 1
    if (el instanceof BoolVar) {
      const binVar = getBinVarForBoolElement(el, originalName);
      emitConstraint(new Constraint(linExpr([[binVar, 1]], 0), ">=", 1, originalName), originalName);
      return;
    }

    // Case B: BoolOp
    if (el instanceof BoolOp) {
      // B.1 NOT: not(child)  <=>  child == false
      if (el.op === "not") {
        const child = el.children[0];
        if (child instanceof BoolVar) {
          const binVar = getBinVarForBoolElement(child, originalName);
          emitConstraint(new Constraint(linExpr([[binVar, 1]], 0), "<=", 0, originalName), originalName);
          return;
        }
        if (child instanceof Constraint) {
          linearizeTopLevelNegatedConstraint(child, originalName);
          return;
        }
        if (child instanceof BoolOp) {
          if (child.op === "not") {
            linearizeTopLevelElement(child.children[0], originalName);
            return;
          }
          if (child.op === "or") {
            for (const sub of child.children) {
              linearizeTopLevelElement(new BoolOp("not", [sub]), originalName);
            }
            return;
          }
          if (child.op === "and") {
            linearizeTopLevelElement(
              new BoolOp("or", child.children.map((sub) => new BoolOp("not", [sub]))),
              originalName
            );
            return;
          }
          if (child.op === "implies") {
            linearizeTopLevelElement(child.children[0], originalName);
            linearizeTopLevelElement(new BoolOp("not", [child.children[1]]), originalName);
            return;
          }
        }
        // not of xor / remaining compound: aux == 0
        const aux = getBinVarForBoolElement(child, originalName);
        emitConstraint(new Constraint(linExpr([[aux, 1]], 0), "<=", 0, originalName), originalName);
        return;
      }

      // B.2 AND: and(c1, c2, ...)  <=>  each child must hold as a top-level constraint
      if (el.op === "and") {
        for (let i = 0; i < el.children.length; i++) {
          linearizeTopLevelElement(el.children[i], `${originalName}_and_${i}`);
        }
        return;
      }

      // B.3 OR: or(c1, c2, ...)
      if (el.op === "or") {
        // If all children are pure boolean (neither Constraint nor not(Constraint)), sum(childBins) >= 1
        const allBoolean = el.children.every(
          (c) =>
            !(c instanceof Constraint) &&
            !(c instanceof BoolOp && c.op === "not" && c.children[0] instanceof Constraint)
        );
        if (allBoolean) {
          const childBins = el.children.map((c) => getBinVarForBoolElement(c, originalName));
          const terms: [Var, number][] = childBins.map((cb) => [cb, 1]);
          emitConstraint(new Constraint(linExpr(terms, 0), ">=", 1, originalName), originalName);
          return;
        }

        // If children include comparison constraints (or negated comparison constraints):
        // For each child c_i, introduce aux y_i, enforce y_i => c_i, and sum(y_i) >= 1
        const auxVars: Var[] = [];
        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i];
          const y = new Var({ name: getUniqueAuxName(`or_branch_${i}`), type: "Binary", lb: 0, ub: 1 });
          variables.push(y);
          auxVars.push(y);

          if (child instanceof Constraint) {
            linearizeIndicator(y, child, 1, `${originalName}_or_branch_${i}`, originalName);
          } else if (child instanceof BoolOp && child.op === "not" && child.children[0] instanceof Constraint) {
            linearizeNegatedConstraint(y, child.children[0], 1, `${originalName}_or_neg_${i}`, originalName);
          } else {
            // BoolVar or BoolOp: y <= child
            const childBin = getBinVarForBoolElement(child, originalName);
            emitConstraint(
              new Constraint(linExpr([[y, 1], [childBin, -1]], 0), "<=", 0, `${originalName}_or_bool_${i}`),
              originalName
            );
          }
        }
        const sumTerms: [Var, number][] = auxVars.map((y) => [y, 1]);
        emitConstraint(new Constraint(linExpr(sumTerms, 0), ">=", 1, originalName), originalName);
        return;
      }

      // B.4 XOR: parity fold
      if (el.op === "xor") {
        if (el.children.length === 0) {
          // xor() == false, but top-level asserts true -> Infeasible
          const dummy = new Var({ name: getUniqueAuxName("unsat"), type: "Binary", lb: 0, ub: 0 });
          variables.push(dummy);
          const c = new Constraint(linExpr([[dummy, 1]], 0), ">=", 1, originalName);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
          return;
        }
        if (el.children.length === 1) {
          linearizeTopLevelElement(el.children[0], originalName);
          return;
        }
        const childBins = el.children.map((c) => getBinVarForBoolElement(c, originalName));
        if (childBins.length === 2) {
          const c = new Constraint(linExpr([[childBins[0], 1], [childBins[1], 1]], 0), "==", 1, originalName);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
          return;
        }
        // Variadic XOR parity fold: (a ^ b) ^ c ... == 1
        let currentBin = childBins[0];
        for (let i = 1; i < childBins.length - 1; i++) {
          const nextAux = new Var({ name: getUniqueAuxName(`xor_fold_${i}`), type: "Binary", lb: 0, ub: 1 });
          variables.push(nextAux);
          linearizeBinaryXorEquivalence(nextAux, currentBin, childBins[i], `${originalName}_xor_fold_${i}`);
          currentBin = nextAux;
        }
        const lastBin = childBins[childBins.length - 1];
        const c = new Constraint(linExpr([[currentBin, 1], [lastBin, 1]], 0), "==", 1, originalName);
        constraints.push(c);
        constraintToOriginalName.set(c, originalName);
        return;
      }

      // B.5 IMPLIES: antecedent => consequent
      if (el.op === "implies") {
        const [antecedent, consequent] = el.children;
        const directBin = antecedent instanceof Constraint ? matchDirectBinaryCondition(antecedent) : null;

        if (directBin !== null) {
          if (consequent instanceof Constraint && (consequent.lhs.terms.get(directBin.binVar) ?? 0) === 0) {
            linearizeIndicator(directBin.binVar, consequent, directBin.activeVal, originalName, originalName);
            return;
          }
          if (consequent instanceof BoolVar) {
            const consBin = getBinVarForBoolElement(consequent, originalName);
            const c =
              directBin.activeVal === 1
                ? new Constraint(linExpr([[consBin, 1], [directBin.binVar, -1]], 0), ">=", 0, originalName)
                : new Constraint(linExpr([[consBin, 1], [directBin.binVar, 1]], 0), ">=", 1, originalName);
            emitConstraint(c, originalName);
            return;
          }
          if (consequent instanceof BoolOp && consequent.op === "not") {
            const notTarget = consequent.children[0];
            if (notTarget instanceof BoolVar) {
              const consBin = getBinVarForBoolElement(notTarget, originalName);
              const c =
                directBin.activeVal === 1
                  ? new Constraint(linExpr([[consBin, 1], [directBin.binVar, 1]], 0), "<=", 1, originalName)
                  : new Constraint(linExpr([[consBin, 1], [directBin.binVar, -1]], 0), "<=", 0, originalName);
              emitConstraint(c, originalName);
              return;
            }
            if (notTarget instanceof Constraint && (notTarget.lhs.terms.get(directBin.binVar) ?? 0) === 0) {
              linearizeNegatedConstraint(directBin.binVar, notTarget, directBin.activeVal, originalName, originalName);
              return;
            }
          }
        }

        // General antecedent: introduce aux binary anteBin and enforce contrapositive
        //   anteBin == 0 => not(antecedent)   (equivalently: antecedent => anteBin == 1)
        // followed by:
        //   anteBin == 1 => consequent
        let anteBin: Var;
        if (antecedent instanceof Constraint) {
          anteBin = new Var({ name: getUniqueAuxName("ante"), type: "Binary", lb: 0, ub: 1 });
          variables.push(anteBin);
          linearizeNegatedConstraint(anteBin, antecedent, 0, `${originalName}_ante_neg`, originalName);
        } else {
          anteBin = getBinVarForBoolElement(antecedent, originalName);
        }

        // Consequent handling:
        if (consequent instanceof Constraint) {
          linearizeIndicator(anteBin, consequent, 1, originalName, originalName);
          return;
        }

        if (consequent instanceof BoolVar) {
          const consBin = getBinVarForBoolElement(consequent, originalName);
          // anteBin <= consBin  <=>  consBin - anteBin >= 0
          emitConstraint(new Constraint(linExpr([[consBin, 1], [anteBin, -1]], 0), ">=", 0, originalName), originalName);
          return;
        }

        if (consequent instanceof BoolOp) {
          if (consequent.op === "and") {
            for (let i = 0; i < consequent.children.length; i++) {
              linearizeTopLevelElement(new BoolOp("implies", [anteBin instanceof Var ? new BoolVarWrapper(anteBin) : antecedent, consequent.children[i]]), `${originalName}_and_${i}`);
            }
            return;
          }
          if (consequent.op === "not") {
            const notChild = consequent.children[0];
            if (notChild instanceof Constraint) {
              linearizeNegatedConstraint(anteBin, notChild, 1, originalName, originalName);
              return;
            }
            const notChildBin = getBinVarForBoolElement(notChild, originalName);
            // anteBin => ~notChildBin  <=>  anteBin + notChildBin <= 1
            emitConstraint(new Constraint(linExpr([[anteBin, 1], [notChildBin, 1]], 0), "<=", 1, originalName), originalName);
            return;
          }
          // General compound consequent
          const consBin = getBinVarForBoolElement(consequent, originalName);
          emitConstraint(new Constraint(linExpr([[consBin, 1], [anteBin, -1]], 0), ">=", 0, originalName), originalName);
          return;
        }
      }
    }

    throw new Error(`Unsupported top-level logical constraint "${originalName}": ${el}`);
  }

  function emitConstraint(c: Constraint, originalName: string): void {
    constraints.push(c);
    constraintToOriginalName.set(c, originalName);
  }

  function emitSingleIndicator(
    binVar: Var,
    lhs: LinExpr,
    sense: "<=" | ">=",
    rhs: number,
    activeVal: 0 | 1,
    constraintName: string,
    originalName: string
  ): void {
    const M = sense === "<="
      ? deriveBigMForLe(lhs, rhs, constraintName)
      : deriveBigMForGe(lhs, rhs, constraintName);
    const lin = buildIndicatorLinearization(binVar, lhs, sense, rhs, activeVal, M, constraintName);
    if (lin.lhs.terms.size > 0) {
      emitConstraint(new Constraint(lin.lhs, sense, lin.rhs, constraintName), originalName);
    }
  }

  function linearizeIndicator(
    binVar: Var,
    targetConstraint: Constraint,
    activeVal: 0 | 1,
    constraintName: string,
    originalName: string
  ): void {
    const { lhs, sense, rhs } = targetConstraint;
    if (sense === "==") {
      emitSingleIndicator(binVar, lhs, "<=", rhs, activeVal, `${constraintName}_le`, originalName);
      emitSingleIndicator(binVar, lhs, ">=", rhs, activeVal, `${constraintName}_ge`, originalName);
    } else {
      emitSingleIndicator(binVar, lhs, sense, rhs, activeVal, constraintName, originalName);
    }
  }

  function emitUnsatConstraint(originalName: string): void {
    const dummy = new Var({ name: getUniqueAuxName("unsat"), type: "Binary", lb: 0, ub: 0 });
    variables.push(dummy);
    emitConstraint(new Constraint(linExpr([[dummy, 1]], 0), ">=", 1, originalName), originalName);
  }

  function linearizeTopLevelConstraint(targetConstraint: Constraint, originalName: string): void {
    const { lhs, sense, rhs } = targetConstraint;
    const constant = lhs.constant ?? 0;
    const effectiveRhs = rhs - constant;
    if (!Number.isFinite(constant) || !Number.isFinite(rhs) || !Number.isFinite(effectiveRhs)) {
      throw new Error(
        `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
          `constraint "${targetConstraint.name}" contains non-finite constant or right-hand side.`
      );
    }
    const nonZeroTerms: [Var, number][] = [];
    for (const [v, coeff] of lhs.terms) {
      if (!Number.isFinite(coeff)) {
        throw new Error(
          `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
            `variable "${v.name}" in constraint "${targetConstraint.name}" has non-finite coefficient (${coeff}).`
        );
      }
      if (coeff !== 0) nonZeroTerms.push([v, coeff]);
    }
    if (nonZeroTerms.length === 0) {
      const holds =
        sense === "<=" ? 0 <= effectiveRhs : sense === ">=" ? 0 >= effectiveRhs : 0 === effectiveRhs;
      if (!holds) emitUnsatConstraint(originalName);
      return;
    }
    emitConstraint(new Constraint(new LinExpr(new Map(nonZeroTerms), 0), sense, effectiveRhs, originalName), originalName);
  }

  function linearizeTopLevelNegatedConstraint(targetConstraint: Constraint, originalName: string): void {
    const neg = negateIntegerConstraint(targetConstraint, originalName);
    if (neg.kind === "always_true") return;
    if (neg.kind === "always_false") {
      emitUnsatConstraint(originalName);
      return;
    }
    if (neg.kind === "single") {
      emitConstraint(new Constraint(neg.lhs, neg.sense, neg.rhs, originalName), originalName);
      return;
    }
    const ltBin = new Var({ name: getUniqueAuxName("neq_lt"), type: "Binary", lb: 0, ub: 1 });
    const gtBin = new Var({ name: getUniqueAuxName("neq_gt"), type: "Binary", lb: 0, ub: 1 });
    variables.push(ltBin, gtBin);
    emitSingleIndicator(ltBin, neg.lhs, "<=", neg.ltRhs, 1, `${originalName}_lt`, originalName);
    emitSingleIndicator(gtBin, neg.lhs, ">=", neg.gtRhs, 1, `${originalName}_gt`, originalName);
    emitConstraint(new Constraint(linExpr([[ltBin, 1], [gtBin, 1]], 0), ">=", 1, originalName), originalName);
  }

  // Enforces: binVar == activeVal => not(targetConstraint)
  function linearizeNegatedConstraint(
    binVar: Var,
    targetConstraint: Constraint,
    activeVal: 0 | 1,
    constraintName: string,
    originalName: string
  ): void {
    const neg = negateIntegerConstraint(targetConstraint, originalName);
    if (neg.kind === "always_true") return;
    if (neg.kind === "always_false") {
      emitConstraint(
        new Constraint(
          linExpr([[binVar, 1]], 0),
          activeVal === 0 ? ">=" : "<=",
          activeVal === 0 ? 1 : 0,
          constraintName
        ),
        originalName
      );
      return;
    }
    if (neg.kind === "single") {
      emitSingleIndicator(binVar, neg.lhs, neg.sense, neg.rhs, activeVal, constraintName, originalName);
      return;
    }
    const ltBin = new Var({ name: getUniqueAuxName("neq_lt"), type: "Binary", lb: 0, ub: 1 });
    const gtBin = new Var({ name: getUniqueAuxName("neq_gt"), type: "Binary", lb: 0, ub: 1 });
    variables.push(ltBin, gtBin);
    emitSingleIndicator(ltBin, neg.lhs, "<=", neg.ltRhs, 1, `${constraintName}_lt`, originalName);
    emitSingleIndicator(gtBin, neg.lhs, ">=", neg.gtRhs, 1, `${constraintName}_gt`, originalName);
    emitConstraint(
      new Constraint(
        linExpr([[ltBin, 1], [gtBin, 1], [binVar, activeVal === 0 ? 1 : -1]], 0),
        ">=",
        activeVal === 0 ? 1 : 0,
        `${constraintName}_disj`
      ),
      originalName
    );
  }

  return {
    variables,
    constraints,
    boolVarToBinary,
    constraintToOriginalName,
  };
}

// Minimal wrapper to pass a Var as a BoolVar placeholder when decomposing nested implications
class BoolVarWrapper extends BoolVar {
  public readonly wrappedVar: Var;
  constructor(v: Var) {
    super(v.name);
    this.wrappedVar = v;
  }
}

type NegatedIntegerConstraint =
  | { kind: "always_true" }
  | { kind: "always_false" }
  | { kind: "single"; lhs: LinExpr; sense: "<=" | ">="; rhs: number }
  | { kind: "disjunction"; lhs: LinExpr; ltRhs: number; gtRhs: number };

function matchDirectBinaryCondition(c: Constraint): { binVar: Var; activeVal: 0 | 1 } | null {
  if (c.lhs.terms.size !== 1 || (c.lhs.constant ?? 0) !== 0) return null;
  const [[v, coeff]] = Array.from(c.lhs.terms.entries());
  const isBin = (v.type === "Binary" || v.type === "Integer") && v.lb === 0 && v.ub === 1;
  if (!isBin || coeff !== 1) return null;
  if ((c.sense === "==" && c.rhs === 1) || (c.sense === ">=" && c.rhs === 1)) {
    return { binVar: v, activeVal: 1 };
  }
  if ((c.sense === "==" && c.rhs === 0) || (c.sense === "<=" && c.rhs === 0)) {
    return { binVar: v, activeVal: 0 };
  }
  return null;
}

/**
 * Computes the exact closed-half-space negation of an integer linear constraint.
 * Rejects constraints with Continuous variables or non-integer coefficients/thresholds,
 * whose strict-inequality negation is an open half-space not representable in MIP.
 */
function negateIntegerConstraint(
  targetConstraint: Constraint,
  originalName: string
): NegatedIntegerConstraint {
  const { lhs, sense, rhs } = targetConstraint;
  const constant = lhs.constant ?? 0;
  const effectiveRhs = rhs - constant;

  if (!Number.isFinite(constant) || !Number.isFinite(rhs) || !Number.isFinite(effectiveRhs)) {
    throw new Error(
      `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
        `constraint "${targetConstraint.name}" contains non-finite constant or right-hand side.`
    );
  }
  if (sense !== "<=" && sense !== ">=" && sense !== "==") {
    throw new Error(
      `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
        `unsupported comparison sense "${String(sense)}" in constraint "${targetConstraint.name}".`
    );
  }

  const nonZeroTerms: [Var, number][] = [];
  for (const [v, coeff] of lhs.terms) {
    if (!Number.isFinite(coeff)) {
      throw new Error(
        `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
          `variable "${v.name}" in constraint "${targetConstraint.name}" has non-finite coefficient (${coeff}).`
      );
    }
    if (coeff === 0) continue;
    if (v.type !== "Integer" && v.type !== "Binary") {
      throw new Error(
        `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
          `negating constraint "${targetConstraint.name}" involves Continuous variable "${v.name}", ` +
          `whose strict-inequality negation creates an open half-space not representable in MIP. ` +
          `Use { solver: "z3" }, rewrite explicitly with a closed tolerance such as or(expr\`... >= ... + eps\`, ...), or model the proposition with m.bool().`
      );
    }
    if (!Number.isSafeInteger(coeff)) {
      throw new Error(
        `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
          `negating constraint "${targetConstraint.name}" requires safe integer coefficients, but variable "${v.name}" has coefficient ${coeff}. ` +
          `Scale to integer coefficients, use { solver: "z3" }, or rewrite explicitly with or(expr\`... >= ... + eps\`, ...) / m.bool().`
      );
    }
    nonZeroTerms.push([v, coeff]);
  }

  if (nonZeroTerms.length === 0) {
    const holds =
      sense === "<=" ? 0 <= effectiveRhs : sense === ">=" ? 0 >= effectiveRhs : 0 === effectiveRhs;
    return holds ? { kind: "always_false" } : { kind: "always_true" };
  }

  if (!Number.isInteger(effectiveRhs)) {
    throw new Error(
      `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
        `negating constraint "${targetConstraint.name}" requires an integer right-hand side and constant, received effective right-hand side ${effectiveRhs}. ` +
        `Scale or round the threshold to an integer, use { solver: "z3" }, or rewrite explicitly with or(expr\`... >= ... + eps\`, ...) / m.bool().`
    );
  }
  if (Math.abs(effectiveRhs) >= Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Cannot linearize logical constraint "${originalName}" for MIP solver: ` +
        `effective right-hand side (${effectiveRhs}) of constraint "${targetConstraint.name}" exceeds safe integer precision for exact +/-1 negation. ` +
        `Please rescale coefficients/constants or solve with { solver: "z3" }.`
    );
  }

  const termsOnlyLhs = new LinExpr(new Map(nonZeroTerms), 0);
  if (sense === "<=") {
    return { kind: "single", lhs: termsOnlyLhs, sense: ">=", rhs: effectiveRhs + 1 };
  }
  if (sense === ">=") {
    return { kind: "single", lhs: termsOnlyLhs, sense: "<=", rhs: effectiveRhs - 1 };
  }

  // sense === "==": negation over integers is (lhs <= ltRhs) OR (lhs >= gtRhs).
  // Prune branches that cannot hold within exact variable bounds.
  const ltRhs = effectiveRhs - 1;
  const gtRhs = effectiveRhs + 1;
  let minLhs = 0;
  let maxLhs = 0;
  let minExact = true;
  let maxExact = true;
  for (const [v, coeff] of nonZeroTerms) {
    if (!(v.lb <= v.ub)) {
      minExact = false;
      maxExact = false;
      break;
    }
    const minBound = coeff > 0 ? v.lb : v.ub;
    const maxBound = coeff > 0 ? v.ub : v.lb;
    const termMin = coeff * minBound;
    const termMax = coeff * maxBound;
    minLhs += termMin;
    maxLhs += termMax;
    minExact &&= Number.isSafeInteger(minBound) && Number.isSafeInteger(termMin) && Number.isSafeInteger(minLhs);
    maxExact &&= Number.isSafeInteger(maxBound) && Number.isSafeInteger(termMax) && Number.isSafeInteger(maxLhs);
  }
  const canBeLt = !(minExact && minLhs > ltRhs);
  const canBeGt = !(maxExact && maxLhs < gtRhs);

  if (!canBeLt && !canBeGt) return { kind: "always_false" };
  if (!canBeGt) return { kind: "single", lhs: termsOnlyLhs, sense: "<=", rhs: ltRhs };
  if (!canBeLt) return { kind: "single", lhs: termsOnlyLhs, sense: ">=", rhs: gtRhs };
  return { kind: "disjunction", lhs: termsOnlyLhs, ltRhs, gtRhs };
}
