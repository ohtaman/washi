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
    // Case A: Pure BoolVar: el == true  <=>  binVar >= 1
    if (el instanceof BoolVar) {
      const binVar = boolVarToBinary.get(el)!;
      const c = new Constraint(linExpr([[binVar, 1]], 0), ">=", 1, originalName);
      constraints.push(c);
      constraintToOriginalName.set(c, originalName);
      return;
    }

    // Case B: BoolOp
    if (el instanceof BoolOp) {
      // B.1 NOT: not(child)  <=>  child == false
      if (el.op === "not") {
        const child = el.children[0];
        if (child instanceof BoolVar) {
          const binVar = boolVarToBinary.get(child)!;
          const c = new Constraint(linExpr([[binVar, 1]], 0), "<=", 0, originalName);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
          return;
        }
        // not of compound: aux == 0
        const aux = getBinVarForBoolElement(child, originalName);
        const c = new Constraint(linExpr([[aux, 1]], 0), "<=", 0, originalName);
        constraints.push(c);
        constraintToOriginalName.set(c, originalName);
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
        // If all children are BoolVars (or compound BoolOps), sum(childBins) >= 1
        const allBoolean = el.children.every((c) => c instanceof BoolVar || c instanceof BoolOp);
        if (allBoolean) {
          const childBins = el.children.map((c) => getBinVarForBoolElement(c, originalName));
          const terms: [Var, number][] = childBins.map((cb) => [cb, 1]);
          const c = new Constraint(linExpr(terms, 0), ">=", 1, originalName);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
          return;
        }

        // If children include comparison constraints:
        // For each child c_i, introduce aux y_i, enforce y_i => c_i, and sum(y_i) >= 1
        const auxVars: Var[] = [];
        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i];
          const y = new Var({ name: getUniqueAuxName(`or_branch_${i}`), type: "Binary", lb: 0, ub: 1 });
          variables.push(y);
          auxVars.push(y);

          if (child instanceof Constraint) {
            linearizeIndicator(y, child, 1, `${originalName}_or_branch_${i}`, originalName);
          } else {
            // BoolVar or BoolOp: y <= child
            const childBin = getBinVarForBoolElement(child, originalName);
            const c = new Constraint(linExpr([[y, 1], [childBin, -1]], 0), "<=", 0, `${originalName}_or_bool_${i}`);
            constraints.push(c);
            constraintToOriginalName.set(c, originalName);
          }
        }
        const sumTerms: [Var, number][] = auxVars.map((y) => [y, 1]);
        const orSumC = new Constraint(linExpr(sumTerms, 0), ">=", 1, originalName);
        constraints.push(orSumC);
        constraintToOriginalName.set(orSumC, originalName);
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

        // Detect if antecedent is a direct binary variable condition: b == 1, b == 0, b <= 0, b >= 1
        if (antecedent instanceof Constraint && antecedent.lhs.terms.size === 1 && antecedent.lhs.constant === 0) {
          const [[v, coeff]] = Array.from(antecedent.lhs.terms.entries());
          const isBin = v.type === "Binary" || (v.type === "Integer" && v.lb === 0 && v.ub === 1);
          if (isBin && coeff === 1) {
            let directActiveVal: 0 | 1 | null = null;
            if (antecedent.sense === "==" && antecedent.rhs === 1) directActiveVal = 1;
            else if (antecedent.sense === "==" && antecedent.rhs === 0) directActiveVal = 0;
            else if (antecedent.sense === "<=" && antecedent.rhs === 0) directActiveVal = 0;
            else if (antecedent.sense === ">=" && antecedent.rhs === 1) directActiveVal = 1;

            if (directActiveVal !== null && consequent instanceof Constraint) {
              linearizeIndicator(v, consequent, directActiveVal, originalName, originalName);
              return;
            }
          }
        }

        // If antecedent is a comparison Constraint (e.g. expr.ge(80000).implies(...))
        // Introduce aux binary var: aux <=> antecedent, then aux => consequent
        let anteBin: Var;
        if (antecedent instanceof Constraint) {
          anteBin = new Var({ name: getUniqueAuxName("ante"), type: "Binary", lb: 0, ub: 1 });
          variables.push(anteBin);
          // If anteBin == 1, then antecedent must hold
          linearizeIndicator(anteBin, antecedent, 1, `${originalName}_ante_active`, originalName);
        } else {
          anteBin = getBinVarForBoolElement(antecedent, originalName);
        }

        // Consequent handling:
        if (consequent instanceof Constraint) {
          linearizeIndicator(anteBin, consequent, 1, originalName, originalName);
          return;
        }

        if (consequent instanceof BoolVar) {
          const consBin = boolVarToBinary.get(consequent)!;
          // anteBin <= consBin  <=>  consBin - anteBin >= 0
          const c = new Constraint(linExpr([[consBin, 1], [anteBin, -1]], 0), ">=", 0, originalName);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
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
            const notChildBin = getBinVarForBoolElement(notChild, originalName);
            // anteBin => ~notChildBin  <=>  anteBin + notChildBin <= 1
            const c = new Constraint(linExpr([[anteBin, 1], [notChildBin, 1]], 0), "<=", 1, originalName);
            constraints.push(c);
            constraintToOriginalName.set(c, originalName);
            return;
          }
          // General compound consequent
          const consBin = getBinVarForBoolElement(consequent, originalName);
          const c = new Constraint(linExpr([[consBin, 1], [anteBin, -1]], 0), ">=", 0, originalName);
          constraints.push(c);
          constraintToOriginalName.set(c, originalName);
          return;
        }
      }
    }

    throw new Error(`Unsupported top-level logical constraint "${originalName}": ${el}`);
  }

  function linearizeIndicator(
    binVar: Var,
    targetConstraint: Constraint,
    activeVal: 0 | 1,
    constraintName: string,
    originalName: string
  ): void {
    const { lhs, sense, rhs } = targetConstraint;
    if (sense === "<=" || sense === ">=") {
      const M = sense === "<="
        ? deriveBigMForLe(lhs, rhs, constraintName)
        : deriveBigMForGe(lhs, rhs, constraintName);

      const lin = buildIndicatorLinearization(binVar, lhs, sense, rhs, activeVal, M, constraintName);
      const c = new Constraint(lin.lhs, sense, lin.rhs, constraintName);
      constraints.push(c);
      constraintToOriginalName.set(c, originalName);
    } else {
      // Equality: sense === "=="
      // Expand to <= and >=
      const MLe = deriveBigMForLe(lhs, rhs, `${constraintName}_le`);
      const MGe = deriveBigMForGe(lhs, rhs, `${constraintName}_ge`);

      const linLe = buildIndicatorLinearization(binVar, lhs, "<=", rhs, activeVal, MLe, `${constraintName}_le`);
      const linGe = buildIndicatorLinearization(binVar, lhs, ">=", rhs, activeVal, MGe, `${constraintName}_ge`);

      const cLe = new Constraint(linLe.lhs, "<=", linLe.rhs, `${constraintName}_le`);
      const cGe = new Constraint(linGe.lhs, ">=", linGe.rhs, `${constraintName}_ge`);

      constraints.push(cLe, cGe);
      constraintToOriginalName.set(cLe, originalName);
      constraintToOriginalName.set(cGe, originalName);
    }
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
