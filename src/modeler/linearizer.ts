import { Constraint } from "./constraint.js";
import { LinExpr, type NonlinearAtom } from "./expression.js";
import { QuadExpr } from "./quad-expr.js";
import { Var } from "./variable.js";
import { BoolVar, BoolOp, GlobalConstraint, type LogicElement } from "./boolean-expr.js";
import { buildIndicatorLinearization, deriveBigMForLe, deriveBigMForGe } from "./big-m.js";
import { normalizeSense, type OptimizationSense } from "./types.js";
import type { LogicalConstraintItem } from "./solvers/types.js";

function linExpr(terms: [Var, number][], constant: number = 0): LinExpr {
  const map = new Map<Var, number>();
  for (const [v, coeff] of terms) {
    if (coeff === 0) continue;
    const next = (map.get(v) ?? 0) + coeff;
    if (next === 0) {
      map.delete(v);
    } else {
      map.set(v, next);
    }
  }
  return new LinExpr(map, constant);
}

function addLinExprInPlace(target: LinExpr, source: LinExpr, scalar: number = 1): void {
  if (scalar === 0) return;
  target.constant += source.constant * scalar;
  for (const [v, coeff] of source.terms.entries()) {
    if (coeff !== 0) {
      target.addTerm(v, coeff * scalar);
    }
  }
}

const MAX_MIP_CUMULATIVE_HORIZON = 5_000;
const MAX_MIP_CUMULATIVE_PULSE_VARS = 25_000;

export interface LinearizationResult {
  variables: Var[];
  constraints: Constraint[];
  boolVarToBinary: Map<BoolVar, Var>;
  constraintToOriginalName: Map<Constraint, string>;
  objective?: LinExpr | QuadExpr;
}

/**
 * Linearizes logical constraints (`BoolVar`, `BoolOp`, `GlobalConstraint`), piecewise-linear
 * / element atoms (`max`, `min`, `abs`, `at`), and discrete `!=` constraints into MIP
 * variables and linear constraints.
 */
export function linearizeModelForMip(
  baseVariables: Var[],
  boolVars: BoolVar[],
  baseConstraints: Constraint[],
  logicalConstraints: LogicalConstraintItem[],
  objectiveInfo?: { expr: LinExpr | QuadExpr; sense: OptimizationSense }
): LinearizationResult {
  const variables = [...baseVariables];
  const constraints: Constraint[] = [];
  const boolVarToBinary = new Map<BoolVar, Var>();
  const constraintToOriginalName = new Map<Constraint, string>();
  const usedConstraintNames = new Set<string>();

  // Keep unchanged linear base constraints as-is and reserve their names upfront
  // so generated auxiliary constraints never collide with user constraint names.
  const loweredBaseConstraints: Constraint[] = [];
  for (const c of baseConstraints) {
    if (c.sense === "!=" || c.lhs.hasNonlinearTerms()) {
      loweredBaseConstraints.push(c);
    } else {
      let emitted = c;
      if (usedConstraintNames.has(emitted.name)) {
        let suffix = 1;
        while (usedConstraintNames.has(`${c.name}_${suffix}`)) {
          suffix++;
        }
        emitted = new Constraint(c.lhs, c.sense, c.rhs, `${c.name}_${suffix}`);
      }
      usedConstraintNames.add(emitted.name);
      constraints.push(emitted);
      constraintToOriginalName.set(emitted, c.name);
    }
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

  function emitConstraint(c: Constraint, originalName: string): void {
    const baseName = c.name || "c";
    let uniqueName = baseName;
    if (usedConstraintNames.has(uniqueName)) {
      let suffix = 1;
      while (usedConstraintNames.has(`${baseName}_${suffix}`)) {
        suffix++;
      }
      uniqueName = `${baseName}_${suffix}`;
      c = new Constraint(c.lhs, c.sense, c.rhs, uniqueName);
    }
    usedConstraintNames.add(uniqueName);
    constraints.push(c);
    constraintToOriginalName.set(c, originalName);
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

  function computeLinExprBounds(
    e: LinExpr,
    context: string
  ): { lb: number; ub: number; isDiscrete: boolean } {
    if (!Number.isFinite(e.constant)) {
      throw new Error(
        `Cannot linearize piecewise expression in "${context}": non-finite constant (${e.constant}).`
      );
    }
    let lb = e.constant;
    let ub = e.constant;
    let isDiscrete = Number.isSafeInteger(e.constant);

    for (const [v, coeff] of e.terms.entries()) {
      if (!Number.isFinite(coeff)) {
        throw new Error(
          `Cannot linearize piecewise expression in "${context}": variable "${v.name}" has non-finite coefficient (${coeff}).`
        );
      }
      if (coeff === 0) continue;
      if (
        typeof v.lb !== "number" ||
        typeof v.ub !== "number" ||
        Number.isNaN(v.lb) ||
        Number.isNaN(v.ub) ||
        v.lb === -Infinity ||
        v.ub === Infinity ||
        v.lb > v.ub
      ) {
        throw new Error(
          `Cannot linearize non-convex piecewise expression in "${context}": variable "${v.name}" has unbounded or invalid domain [${v.lb}, ${v.ub}]. Finite bounds are required.`
        );
      }
      let effLb = v.lb;
      let effUb = v.ub;
      if (v.type === "Binary") {
        const rLb = Math.max(0, Math.ceil(v.lb));
        const rUb = Math.min(1, Math.floor(v.ub));
        if (rLb <= rUb) {
          effLb = rLb;
          effUb = rUb;
        }
      } else if (v.type === "Integer") {
        const rLb = Math.ceil(v.lb);
        const rUb = Math.floor(v.ub);
        if (rLb <= rUb) {
          effLb = rLb;
          effUb = rUb;
        }
      }
      const prodLb = coeff * effLb;
      const prodUb = coeff * effUb;
      lb += Math.min(prodLb, prodUb);
      ub += Math.max(prodLb, prodUb);
      if (!Number.isFinite(lb) || !Number.isFinite(ub)) {
        throw new Error(
          `Cannot linearize non-convex piecewise expression in "${context}": bound calculation overflowed.`
        );
      }
      isDiscrete &&=
        (v.type === "Integer" || v.type === "Binary") &&
        Number.isSafeInteger(coeff) &&
        Number.isSafeInteger(effLb) &&
        Number.isSafeInteger(effUb);
    }

    return {
      lb: Object.is(lb, -0) ? 0 : lb,
      ub: Object.is(ub, -0) ? 0 : ub,
      isDiscrete,
    };
  }

  function flattenLinExprExact(e: LinExpr, origName: string): LinExpr {
    if (!e.hasNonlinearTerms()) {
      return e.clone();
    }
    const base = new LinExpr(e.terms, e.constant);
    for (const term of e.nonlinearTerms) {
      if (term.coeff === 0) continue;
      const rep = lowerAtomExact(term.atom, origName);
      addLinExprInPlace(base, rep, term.coeff);
    }
    return base;
  }

  function lowerAtomExact(atom: NonlinearAtom, origName: string): LinExpr {
    switch (atom.kind) {
      case "abs": {
        const u = flattenLinExprExact(atom.arg, origName);
        const { lb: L, ub: U, isDiscrete } = computeLinExprBounds(u, origName);
        if (L >= 0) return u;
        if (U <= 0) return u.mul(-1);
        const tUb = Math.max(-L, U);
        const t = new Var({
          name: getUniqueAuxName("abs_t"),
          type: isDiscrete ? "Integer" : "Continuous",
          lb: 0,
          ub: tUb,
        });
        const z = new Var({
          name: getUniqueAuxName("abs_z"),
          type: "Binary",
          lb: 0,
          ub: 1,
        });
        variables.push(t, z);
        const tExpr = linExpr([[t, 1]], 0);
        // u - t <= 0
        linearizeTopLevelConstraint(
          new Constraint(u.sub(tExpr), "<=", 0, `${origName}_abs_pos`),
          origName
        );
        // -u - t <= 0
        linearizeTopLevelConstraint(
          new Constraint(u.mul(-1).sub(tExpr), "<=", 0, `${origName}_abs_neg`),
          origName
        );
        // t - u + 2*(-L)*z <= 2*(-L)
        linearizeTopLevelConstraint(
          new Constraint(
            tExpr.sub(u).add(linExpr([[z, 2 * -L]], 0)),
            "<=",
            2 * -L,
            `${origName}_abs_hi_pos`
          ),
          origName
        );
        // t + u - 2*U*z <= 0
        linearizeTopLevelConstraint(
          new Constraint(
            tExpr.add(u).sub(linExpr([[z, 2 * U]], 0)),
            "<=",
            0,
            `${origName}_abs_hi_neg`
          ),
          origName
        );
        return tExpr;
      }

      case "max": {
        const uArgs = atom.args.map((a) => flattenLinExprExact(a, origName));
        if (uArgs.length === 1) return uArgs[0];
        const infos = uArgs.map((u) => computeLinExprBounds(u, origName));
        const tLb = Math.max(...infos.map((b) => b.lb));
        const tUb = Math.max(...infos.map((b) => b.ub));
        const allDiscrete = infos.every((b) => b.isDiscrete);

        const t = new Var({
          name: getUniqueAuxName("max_t"),
          type: allDiscrete ? "Integer" : "Continuous",
          lb: tLb,
          ub: tUb,
        });
        variables.push(t);
        const tExpr = linExpr([[t, 1]], 0);
        const zVars: Var[] = [];

        for (let i = 0; i < uArgs.length; i++) {
          const z = new Var({
            name: getUniqueAuxName(`max_z_${i}`),
            type: "Binary",
            lb: 0,
            ub: 1,
          });
          variables.push(z);
          zVars.push(z);
          // u_i - t <= 0
          linearizeTopLevelConstraint(
            new Constraint(uArgs[i].sub(tExpr), "<=", 0, `${origName}_max_lb_${i}`),
            origName
          );
          // t - u_i + (T_ub - L_i) * z_i <= T_ub - L_i
          const bigM = tUb - infos[i].lb;
          linearizeTopLevelConstraint(
            new Constraint(
              tExpr.sub(uArgs[i]).add(linExpr([[z, bigM]], 0)),
              "<=",
              bigM,
              `${origName}_max_ub_${i}`
            ),
            origName
          );
        }
        emitConstraint(
          new Constraint(
            linExpr(zVars.map((z) => [z, 1]), 0),
            "==",
            1,
            `${origName}_max_sos`
          ),
          origName
        );
        return tExpr;
      }

      case "min": {
        const uArgs = atom.args.map((a) => flattenLinExprExact(a, origName));
        if (uArgs.length === 1) return uArgs[0];
        const infos = uArgs.map((u) => computeLinExprBounds(u, origName));
        const tLb = Math.min(...infos.map((b) => b.lb));
        const tUb = Math.min(...infos.map((b) => b.ub));
        const allDiscrete = infos.every((b) => b.isDiscrete);

        const t = new Var({
          name: getUniqueAuxName("min_t"),
          type: allDiscrete ? "Integer" : "Continuous",
          lb: tLb,
          ub: tUb,
        });
        variables.push(t);
        const tExpr = linExpr([[t, 1]], 0);
        const zVars: Var[] = [];

        for (let i = 0; i < uArgs.length; i++) {
          const z = new Var({
            name: getUniqueAuxName(`min_z_${i}`),
            type: "Binary",
            lb: 0,
            ub: 1,
          });
          variables.push(z);
          zVars.push(z);
          // u_i - t >= 0
          linearizeTopLevelConstraint(
            new Constraint(uArgs[i].sub(tExpr), ">=", 0, `${origName}_min_ub_${i}`),
            origName
          );
          // u_i - t + (U_i - T_lb) * z_i <= U_i - T_lb
          const bigM = infos[i].ub - tLb;
          linearizeTopLevelConstraint(
            new Constraint(
              uArgs[i].sub(tExpr).add(linExpr([[z, bigM]], 0)),
              "<=",
              bigM,
              `${origName}_min_lb_${i}`
            ),
            origName
          );
        }
        emitConstraint(
          new Constraint(
            linExpr(zVars.map((z) => [z, 1]), 0),
            "==",
            1,
            `${origName}_min_sos`
          ),
          origName
        );
        return tExpr;
      }

      case "at": {
        const n = atom.array.length;
        const idxLin = flattenLinExprExact(atom.index, origName);
        const elemLins = atom.array.map((el) => flattenLinExprExact(el, origName));

        const lambdas: Var[] = [];
        for (let k = 0; k < n; k++) {
          const lam = new Var({
            name: getUniqueAuxName(`at_lam_${k}`),
            type: "Binary",
            lb: 0,
            ub: 1,
          });
          variables.push(lam);
          lambdas.push(lam);
        }

        // sum_k lam_k == 1
        emitConstraint(
          new Constraint(
            linExpr(lambdas.map((l) => [l, 1]), 0),
            "==",
            1,
            `${origName}_at_sos`
          ),
          origName
        );

        // idxLin - sum_k k * lam_k == 0
        const idxBalance = idxLin.clone();
        for (let k = 1; k < n; k++) {
          idxBalance.addTerm(lambdas[k], -k);
        }
        linearizeTopLevelConstraint(
          new Constraint(idxBalance, "==", 0, `${origName}_at_idx`),
          origName
        );

        const out = new LinExpr(new Map(), 0);
        for (let k = 0; k < n; k++) {
          const elem = elemLins[k];
          if (elem.terms.size === 0) {
            if (elem.constant !== 0) {
              out.addTerm(lambdas[k], elem.constant);
            }
          } else {
            const { lb: L_k, ub: U_k, isDiscrete } = computeLinExprBounds(elem, origName);
            const w_k = new Var({
              name: getUniqueAuxName(`at_w_${k}`),
              type: isDiscrete ? "Integer" : "Continuous",
              lb: Math.min(0, L_k),
              ub: Math.max(0, U_k),
            });
            variables.push(w_k);

            const wExpr = linExpr([[w_k, 1]], 0);
            // w_k - L_k * lam_k >= 0
            linearizeTopLevelConstraint(
              new Constraint(linExpr([[w_k, 1], [lambdas[k], -L_k]], 0), ">=", 0, `${origName}_at_mc1_${k}`),
              origName
            );
            // w_k - U_k * lam_k <= 0
            linearizeTopLevelConstraint(
              new Constraint(linExpr([[w_k, 1], [lambdas[k], -U_k]], 0), "<=", 0, `${origName}_at_mc2_${k}`),
              origName
            );
            // w_k - elem - U_k * lam_k >= -U_k
            linearizeTopLevelConstraint(
              new Constraint(
                wExpr.sub(elem).add(linExpr([[lambdas[k], -U_k]], 0)),
                ">=",
                -U_k,
                `${origName}_at_mc3_${k}`
              ),
              origName
            );
            // w_k - elem - L_k * lam_k <= -L_k
            linearizeTopLevelConstraint(
              new Constraint(
                wExpr.sub(elem).add(linExpr([[lambdas[k], -L_k]], 0)),
                "<=",
                -L_k,
                `${origName}_at_mc4_${k}`
              ),
              origName
            );
            out.addTerm(w_k, 1);
          }
        }
        return out;
      }
    }
  }

  function lowerAtomWithPolarity(
    atom: NonlinearAtom,
    polarity: "upper" | "lower" | "exact",
    origName: string
  ): LinExpr {
    if (polarity === "upper" && atom.kind === "max") {
      const t = new Var({
        name: getUniqueAuxName("epi_max"),
        type: "Continuous",
        lb: -Infinity,
        ub: Infinity,
      });
      variables.push(t);
      const tExpr = linExpr([[t, 1]], 0);
      for (let i = 0; i < atom.args.length; i++) {
        lowerTopLevelLinearRow(
          atom.args[i].sub(tExpr),
          "<=",
          0,
          `${origName}_epi_max_${i}`,
          origName
        );
      }
      return tExpr;
    }

    if (polarity === "upper" && atom.kind === "abs") {
      const u = atom.arg.hasNonlinearTerms()
        ? flattenLinExprExact(atom.arg, origName)
        : atom.arg;
      const t = new Var({
        name: getUniqueAuxName("epi_abs"),
        type: "Continuous",
        lb: 0,
        ub: Infinity,
      });
      variables.push(t);
      const tExpr = linExpr([[t, 1]], 0);
      linearizeTopLevelConstraint(
        new Constraint(u.sub(tExpr), "<=", 0, `${origName}_epi_abs_pos`),
        origName
      );
      linearizeTopLevelConstraint(
        new Constraint(u.mul(-1).sub(tExpr), "<=", 0, `${origName}_epi_abs_neg`),
        origName
      );
      return tExpr;
    }

    if (polarity === "lower" && atom.kind === "min") {
      const t = new Var({
        name: getUniqueAuxName("epi_min"),
        type: "Continuous",
        lb: -Infinity,
        ub: Infinity,
      });
      variables.push(t);
      const tExpr = linExpr([[t, 1]], 0);
      for (let i = 0; i < atom.args.length; i++) {
        lowerTopLevelLinearRow(
          atom.args[i].sub(tExpr),
          ">=",
          0,
          `${origName}_epi_min_${i}`,
          origName
        );
      }
      return tExpr;
    }

    return lowerAtomExact(atom, origName);
  }

  function lowerLinExprWithSense(
    lhs: LinExpr,
    sense: "<=" | ">=" | "==" | "!=",
    origName: string
  ): LinExpr {
    if (!lhs.hasNonlinearTerms()) {
      return lhs;
    }
    if (sense === "==" || sense === "!=") {
      return flattenLinExprExact(lhs, origName);
    }
    const base = new LinExpr(lhs.terms, lhs.constant);
    for (const term of lhs.nonlinearTerms) {
      if (term.coeff === 0) continue;
      const polarity: "upper" | "lower" =
        sense === "<="
          ? term.coeff > 0
            ? "upper"
            : "lower"
          : term.coeff > 0
            ? "lower"
            : "upper";
      const rep = lowerAtomWithPolarity(term.atom, polarity, origName);
      addLinExprInPlace(base, rep, term.coeff);
    }
    return base;
  }

  function lowerTopLevelLinearRow(
    lhs: LinExpr,
    sense: "<=" | ">=" | "==" | "!=",
    rhs: number,
    constraintName: string,
    originalName: string
  ): void {
    const flatLhs = lowerLinExprWithSense(lhs, sense, originalName);
    if (sense === "!=") {
      linearizeTopLevelNegatedConstraint(
        new Constraint(flatLhs, "==", rhs, constraintName),
        originalName
      );
      return;
    }
    linearizeTopLevelConstraint(
      new Constraint(flatLhs, sense, rhs, constraintName),
      originalName
    );
  }

  function flattenConstraintExact(c: Constraint, origName: string): Constraint {
    if (!c.lhs.hasNonlinearTerms()) return c;
    return new Constraint(flattenLinExprExact(c.lhs, origName), c.sense, c.rhs, c.name);
  }

  function getBinVarForBoolElement(el: LogicElement, originalName: string): Var {
    if (el instanceof BoolVar) {
      const v = boolVarToBinary.get(el);
      if (!v) {
        throw new Error(`Unregistered BoolVar "${el.name}" in logical constraint "${originalName}".`);
      }
      return v;
    }
    // If it's a compound BoolOp or GlobalConstraint or Constraint, create an aux binary variable and enforce equivalence
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
    emitConstraint(
      new Constraint(linExpr([[outBin, 1], [aBin, -1], [bBin, -1]], 0), "<=", 0, `${origName}_xor_1`),
      origName
    );
    emitConstraint(
      new Constraint(linExpr([[outBin, 1], [aBin, -1], [bBin, 1]], 0), ">=", 0, `${origName}_xor_2`),
      origName
    );
    emitConstraint(
      new Constraint(linExpr([[outBin, 1], [bBin, -1], [aBin, 1]], 0), ">=", 0, `${origName}_xor_3`),
      origName
    );
    emitConstraint(
      new Constraint(linExpr([[outBin, 1], [aBin, 1], [bBin, 1]], 0), "<=", 2, `${origName}_xor_4`),
      origName
    );
  }

  function linearizeElementEquivalence(binVar: Var, el: LogicElement, originalName: string): void {
    if (el instanceof BoolVar) {
      const targetBin = boolVarToBinary.get(el)!;
      // binVar == targetBin  <=>  binVar - targetBin == 0
      emitConstraint(
        new Constraint(linExpr([[binVar, 1], [targetBin, -1]], 0), "==", 0, `${originalName}_equiv`),
        originalName
      );
      return;
    }

    if (el instanceof Constraint) {
      const flat = flattenConstraintExact(el, originalName);
      // binVar <=> flat: (binVar == 0 => not(flat)) and (binVar == 1 => flat)
      linearizeNegatedConstraint(binVar, flat, 0, `${originalName}_c_neg`, originalName);
      linearizeIndicator(binVar, flat, 1, `${originalName}_c_pos`, originalName);
      return;
    }

    if (el instanceof GlobalConstraint) {
      linearizeGlobalEquivalence(binVar, el, originalName);
      return;
    }

    if (el instanceof BoolOp) {
      if (el.op === "not") {
        const childBin = getBinVarForBoolElement(el.children[0], originalName);
        // binVar == 1 - childBin  <=>  binVar + childBin == 1
        emitConstraint(
          new Constraint(linExpr([[binVar, 1], [childBin, 1]], 0), "==", 1, `${originalName}_not`),
          originalName
        );
        return;
      }

      if (el.op === "and") {
        const childBins = el.children.map((child) => getBinVarForBoolElement(child, originalName));
        // binVar <= childBin_i  for all i
        for (let i = 0; i < childBins.length; i++) {
          emitConstraint(
            new Constraint(linExpr([[binVar, 1], [childBins[i], -1]], 0), "<=", 0, `${originalName}_and_ub_${i}`),
            originalName
          );
        }
        // binVar >= sum(childBin_i) - (n - 1)  <=>  binVar - sum(childBin_i) >= 1 - n
        const terms: [Var, number][] = [[binVar, 1], ...childBins.map((cb): [Var, number] => [cb, -1])];
        emitConstraint(
          new Constraint(linExpr(terms, 0), ">=", 1 - childBins.length, `${originalName}_and_lb`),
          originalName
        );
        return;
      }

      if (el.op === "or") {
        const childBins = el.children.map((child) => getBinVarForBoolElement(child, originalName));
        // binVar >= childBin_i  for all i  <=>  binVar - childBin_i >= 0
        for (let i = 0; i < childBins.length; i++) {
          emitConstraint(
            new Constraint(linExpr([[binVar, 1], [childBins[i], -1]], 0), ">=", 0, `${originalName}_or_lb_${i}`),
            originalName
          );
        }
        // binVar <= sum(childBin_i)  <=>  binVar - sum(childBin_i) <= 0
        const terms: [Var, number][] = [[binVar, 1], ...childBins.map((cb): [Var, number] => [cb, -1])];
        emitConstraint(
          new Constraint(linExpr(terms, 0), "<=", 0, `${originalName}_or_ub`),
          originalName
        );
        return;
      }

      if (el.op === "implies") {
        const aBin = getBinVarForBoolElement(el.children[0], originalName);
        const bBin = getBinVarForBoolElement(el.children[1], originalName);
        // binVar <=> (a => b)  <=>  binVar <=> (~a or b)
        // binVar >= b - a  <=>  binVar - b + a >= 0
        // binVar <= 1 - a + b
        emitConstraint(
          new Constraint(linExpr([[binVar, 1], [bBin, -1], [aBin, 1]], 0), ">=", 0, `${originalName}_imp_1`),
          originalName
        );
        emitConstraint(
          new Constraint(linExpr([[binVar, 1], [aBin, 1], [bBin, -1]], 0), "<=", 1, `${originalName}_imp_2`),
          originalName
        );
        return;
      }

      if (el.op === "xor") {
        if (el.children.length === 0) {
          emitConstraint(
            new Constraint(linExpr([[binVar, 1]], 0), "==", 0, `${originalName}_xor_empty`),
            originalName
          );
          return;
        }
        if (el.children.length === 1) {
          const childBin = getBinVarForBoolElement(el.children[0], originalName);
          emitConstraint(
            new Constraint(linExpr([[binVar, 1], [childBin, -1]], 0), "==", 0, `${originalName}_xor_single`),
            originalName
          );
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

  function buildDisjointPairs(tasks: ReadonlyArray<{ readonly start: LinExpr; readonly duration: number }>, origName: string) {
    const starts = tasks.map((t) => flattenLinExprExact(t.start, origName));
    const pairs: Array<{ i: number; j: number; sI: LinExpr; dI: number; sJ: LinExpr; dJ: number }> = [];
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        if (tasks[i].duration > 0 || tasks[j].duration > 0) {
          pairs.push({
            i,
            j,
            sI: starts[i],
            dI: tasks[i].duration,
            sJ: starts[j],
            dJ: tasks[j].duration,
          });
        }
      }
    }
    return pairs;
  }

  function linearizeCumulativeCore(
    tasks: ReadonlyArray<{ readonly start: LinExpr; readonly duration: number; readonly demand: number }>,
    capacity: number,
    origName: string
  ):
    | { kind: "constant"; value: boolean }
    | { kind: "empty_domain" }
    | {
        kind: "tasks";
        active: Array<{ start: LinExpr; duration: number; demand: number; est: number; lst: number }>;
      } {
    // Flatten every task start first so embedded at() domain guards are never dropped by inactive-task pruning.
    const flattened = tasks.map((t) => ({
      start: flattenLinExprExact(t.start, origName),
      duration: t.duration,
      demand: t.demand,
    }));
    const active = flattened.filter((t) => t.duration > 0 && t.demand > 0);
    if (active.length === 0) {
      return { kind: "constant", value: true };
    }

    const bounded: Array<{ start: LinExpr; duration: number; demand: number; est: number; lst: number }> = [];
    for (const t of active) {
      const cnst = t.start.constant ?? 0;
      if (!Number.isSafeInteger(cnst)) {
        throw new Error(
          `Cannot linearize cumulative() constraint "${origName}" for MIP solver: task start offset (${cnst}) must be a safe integer.`
        );
      }
      let est = cnst;
      let lst = cnst;
      for (const [v, coeff] of t.start.terms.entries()) {
        if (coeff === 0) continue;
        if (
          typeof v.lb !== "number" ||
          typeof v.ub !== "number" ||
          Number.isNaN(v.lb) ||
          Number.isNaN(v.ub) ||
          v.lb === -Infinity ||
          v.ub === Infinity ||
          v.lb > v.ub
        ) {
          throw new Error(
            `Cannot linearize cumulative() constraint "${origName}" for MIP solver: variable "${v.name}" has unbounded or invalid domain [${v.lb}, ${v.ub}]. Finite bounds are required.`
          );
        }
        if (!Number.isSafeInteger(coeff)) {
          throw new Error(
            `Cannot linearize cumulative() constraint "${origName}" for MIP solver: variable "${v.name}" coefficient (${coeff}) exceeds safe integer precision.`
          );
        }
        const effLb = v.type === "Binary" ? Math.max(0, Math.ceil(v.lb)) : Math.ceil(v.lb);
        const effUb = v.type === "Binary" ? Math.min(1, Math.floor(v.ub)) : Math.floor(v.ub);
        if (effLb > effUb) {
          return { kind: "empty_domain" };
        }
        if (!Number.isSafeInteger(effLb) || !Number.isSafeInteger(effUb)) {
          throw new Error(
            `Cannot linearize cumulative() constraint "${origName}" for MIP solver: variable "${v.name}" integer bounds [${effLb}, ${effUb}] exceed JavaScript safe integer precision.`
          );
        }
        const prodA = coeff * effLb;
        const prodB = coeff * effUb;
        est += Math.min(prodA, prodB);
        lst += Math.max(prodA, prodB);
        if (
          !Number.isSafeInteger(prodA) ||
          !Number.isSafeInteger(prodB) ||
          !Number.isSafeInteger(est) ||
          !Number.isSafeInteger(lst)
        ) {
          throw new Error(
            `Cannot linearize cumulative() constraint "${origName}" for MIP solver: task start time bounds exceed JavaScript safe integer precision.`
          );
        }
      }
      const endEst = est + t.duration;
      const endLst = lst + t.duration;
      if (!Number.isSafeInteger(endEst) || !Number.isSafeInteger(endLst)) {
        throw new Error(
          `Cannot linearize cumulative() constraint "${origName}" for MIP solver: task end time bounds [${est}, ${endLst}) exceed JavaScript safe integer precision.`
        );
      }
      bounded.push({
        ...t,
        est: Object.is(est, -0) ? 0 : est,
        lst: Object.is(lst, -0) ? 0 : lst,
      });
    }

    if (bounded.some((t) => t.demand > capacity)) {
      return { kind: "constant", value: false };
    }
    return { kind: "tasks", active: bounded };
  }

  function linearizeGlobalTopLevel(
    gc: GlobalConstraint,
    positive: boolean,
    originalName: string
  ): void {
    const spec = gc.spec;
    switch (spec.kind) {
      case "distinct": {
        const flatArgs = spec.args.map((a) => flattenLinExprExact(a, originalName));
        if (flatArgs.length <= 1) {
          if (!positive) emitUnsatConstraint(originalName);
          return;
        }
        if (positive) {
          for (let i = 0; i < flatArgs.length; i++) {
            for (let j = i + 1; j < flatArgs.length; j++) {
              lowerTopLevelLinearRow(
                flatArgs[i].sub(flatArgs[j]),
                "!=",
                0,
                `${originalName}_neq_${i}_${j}`,
                originalName
              );
            }
          }
        } else {
          const eqBranches: Constraint[] = [];
          for (let i = 0; i < flatArgs.length; i++) {
            for (let j = i + 1; j < flatArgs.length; j++) {
              eqBranches.push(new Constraint(flatArgs[i].sub(flatArgs[j]), "==", 0, `${originalName}_eq_${i}_${j}`));
            }
          }
          linearizeTopLevelElement(new BoolOp("or", eqBranches), originalName);
        }
        return;
      }

      case "disjoint": {
        const pairs = buildDisjointPairs(spec.tasks, originalName);
        if (pairs.length === 0) {
          if (!positive) emitUnsatConstraint(originalName);
          return;
        }
        if (positive) {
          for (const { i, j, sI, dI, sJ, dJ } of pairs) {
            const p = new Var({
              name: getUniqueAuxName(`disj_${i}_${j}`),
              type: "Binary",
              lb: 0,
              ub: 1,
            });
            variables.push(p);
            // p == 1 => sI - sJ <= -dI
            emitSingleIndicator(p, sI.sub(sJ), "<=", -dI, 1, `${originalName}_p_${i}_${j}`, originalName);
            // p == 0 => sJ - sI <= -dJ
            emitSingleIndicator(p, sJ.sub(sI), "<=", -dJ, 0, `${originalName}_q_${i}_${j}`, originalName);
          }
        } else {
          const overlaps = pairs.map(({ i, j, sI, dI, sJ, dJ }) =>
            new BoolOp("and", [
              new Constraint(sI.sub(sJ), ">=", 1 - dI, `${originalName}_ov1_${i}_${j}`),
              new Constraint(sJ.sub(sI), ">=", 1 - dJ, `${originalName}_ov2_${i}_${j}`),
            ])
          );
          linearizeTopLevelElement(new BoolOp("or", overlaps), originalName);
        }
        return;
      }

      case "cumulative": {
        const core = linearizeCumulativeCore(spec.tasks, spec.capacity, originalName);
        if (core.kind === "empty_domain") {
          emitUnsatConstraint(originalName);
          return;
        }
        if (core.kind === "constant") {
          if (core.value !== positive) emitUnsatConstraint(originalName);
          return;
        }
        const { active } = core;
        if (positive) {
          let hMin = Infinity;
          let hMax = -Infinity;
          let totalPulseVars = 0;
          for (const t of active) {
            if (t.est < hMin) hMin = t.est;
            if (t.lst + t.duration > hMax) hMax = t.lst + t.duration;
            totalPulseVars += Math.max(0, t.lst - t.est + 1);
          }
          const span = hMax - hMin;
          if (
            !Number.isSafeInteger(span) ||
            span > MAX_MIP_CUMULATIVE_HORIZON ||
            totalPulseVars > MAX_MIP_CUMULATIVE_PULSE_VARS
          ) {
            throw new Error(
              `Cannot linearize cumulative() constraint "${originalName}" for MIP solver: time horizon [${hMin}, ${hMax}) (span ${span}, ${totalPulseVars} time-indexed variables) exceeds MIP limit. Tighten start bounds or use { solver: "pumpkin" }.`
            );
          }
          const pulseMaps: Array<Map<number, Var>> = [];
          for (let i = 0; i < active.length; i++) {
            const t = active[i];
            const map = new Map<number, Var>();
            const sumTerms: [Var, number][] = [];
            const startBalance = t.start.clone();
            for (let tau = t.est; tau <= t.lst; tau++) {
              const u = new Var({
                name: getUniqueAuxName(`cum_u_${i}_${tau}`),
                type: "Binary",
                lb: 0,
                ub: 1,
              });
              variables.push(u);
              map.set(tau, u);
              sumTerms.push([u, 1]);
              if (tau !== 0) {
                startBalance.addTerm(u, -tau);
              }
            }
            if (sumTerms.length === 0) {
              emitUnsatConstraint(originalName);
              return;
            }
            emitConstraint(
              new Constraint(linExpr(sumTerms, 0), "==", 1, `${originalName}_cum_sos_${i}`),
              originalName
            );
            linearizeTopLevelConstraint(
              new Constraint(startBalance, "==", 0, `${originalName}_cum_start_${i}`),
              originalName
            );
            pulseMaps.push(map);
          }

          for (let time = hMin; time < hMax; time++) {
            const capTerms: [Var, number][] = [];
            let maxPossible = 0;
            for (let i = 0; i < active.length; i++) {
              const t = active[i];
              const tauLo = time <= t.est + t.duration - 1 ? t.est : time - t.duration + 1;
              const tauHi = Math.min(t.lst, time);
              if (tauLo <= tauHi) {
                maxPossible += t.demand;
                const map = pulseMaps[i];
                for (let tau = tauLo; tau <= tauHi; tau++) {
                  const u = map.get(tau);
                  if (u) capTerms.push([u, t.demand]);
                }
              }
            }
            if (maxPossible > spec.capacity && capTerms.length > 0) {
              emitConstraint(
                new Constraint(linExpr(capTerms, 0), "<=", spec.capacity, `${originalName}_cum_t_${time}`),
                originalName
              );
            }
          }
          return;
        }

        // Negative: overload must occur at the start time s_k of at least one active task k
        const overloadBranches: BoolOp[] = [];
        for (let k = 0; k < active.length; k++) {
          const tK = active[k];
          const terms: [Var, number][] = [];
          for (let i = 0; i < active.length; i++) {
            if (i === k) continue;
            const tI = active[i];
            const aIk = new Var({
              name: getUniqueAuxName(`cum_act_${i}_${k}`),
              type: "Binary",
              lb: 0,
              ub: 1,
            });
            variables.push(aIk);
            const activeCond = new BoolOp("and", [
              new Constraint(tI.start.sub(tK.start), "<=", 0, `${originalName}_act_le_${i}_${k}`),
              new Constraint(tK.start.sub(tI.start), "<=", tI.duration - 1, `${originalName}_act_ge_${i}_${k}`),
            ]);
            linearizeElementEquivalence(aIk, activeCond, originalName);
            terms.push([aIk, tI.demand]);
          }
          const overloadConstraint = new Constraint(
            linExpr(terms, 0),
            ">=",
            spec.capacity - tK.demand + 1,
            `${originalName}_overload_${k}`
          );
          overloadBranches.push(new BoolOp("and", [overloadConstraint]));
        }
        linearizeTopLevelElement(new BoolOp("or", overloadBranches), originalName);
        return;
      }

      case "allowed": {
        const flatVars = spec.vars.map((v) => flattenLinExprExact(v, originalName));
        if (spec.tuples.length === 0) {
          if (positive) emitUnsatConstraint(originalName);
          return;
        }
        if (positive) {
          const selectors: Var[] = [];
          for (let r = 0; r < spec.tuples.length; r++) {
            const y = new Var({
              name: getUniqueAuxName(`tbl_r_${r}`),
              type: "Binary",
              lb: 0,
              ub: 1,
            });
            variables.push(y);
            selectors.push(y);
          }
          emitConstraint(
            new Constraint(
              linExpr(selectors.map((y) => [y, 1]), 0),
              "==",
              1,
              `${originalName}_tbl_sos`
            ),
            originalName
          );
          for (let j = 0; j < flatVars.length; j++) {
            const colExpr = flatVars[j].clone();
            for (let r = 0; r < spec.tuples.length; r++) {
              const val = spec.tuples[r][j];
              if (val !== 0) {
                colExpr.addTerm(selectors[r], -val);
              }
            }
            linearizeTopLevelConstraint(
              new Constraint(colExpr, "==", 0, `${originalName}_tbl_col_${j}`),
              originalName
            );
          }
          return;
        }

        // Negative table (`not(allowed(vars, tuples))`)
        // Check if each column is a 2-valued single discrete variable so we can emit zero-binary no-good cuts.
        const colBinaryInfos = flatVars.map((vExpr) => {
          const nonZero = Array.from(vExpr.terms.entries()).filter(([, c]) => c !== 0);
          if (nonZero.length !== 1) return null;
          const [v, coeff] = nonZero[0];
          if (Math.abs(coeff) !== 1) return null;
          if (!Number.isSafeInteger(v.lb) || !Number.isSafeInteger(v.ub) || v.ub - v.lb !== 1) return null;
          const cnst = vExpr.constant;
          if (!Number.isSafeInteger(cnst)) return null;
          const v0 = coeff * v.lb + cnst;
          const v1 = coeff * v.ub + cnst;
          return { expr: vExpr, lo: Math.min(v0, v1), hi: Math.max(v0, v1) };
        });

        for (let r = 0; r < spec.tuples.length; r++) {
          const row = spec.tuples[r];
          let allTwoValued = true;
          let impossibleTuple = false;
          for (let j = 0; j < row.length; j++) {
            const info = colBinaryInfos[j];
            if (!info) {
              allTwoValued = false;
              break;
            }
            if (row[j] !== info.lo && row[j] !== info.hi) {
              impossibleTuple = true;
              break;
            }
          }
          if (impossibleTuple) continue;
          if (allTwoValued) {
            const cutExpr = new LinExpr(new Map(), 0);
            for (let j = 0; j < row.length; j++) {
              const info = colBinaryInfos[j]!;
              if (row[j] === info.lo) {
                addLinExprInPlace(cutExpr, info.expr.sub(info.lo), 1);
              } else {
                addLinExprInPlace(cutExpr, linExpr([], info.hi).sub(info.expr), 1);
              }
            }
            linearizeTopLevelConstraint(
              new Constraint(cutExpr, ">=", 1, `${originalName}_nogood_${r}`),
              originalName
            );
          } else {
            const disj = new BoolOp(
              "or",
              row.map((val, j) => new Constraint(flatVars[j], "!=", val, `${originalName}_ntbl_${r}_${j}`))
            );
            linearizeTopLevelElement(disj, originalName, `${originalName}_ntbl_${r}`);
          }
        }
        return;
      }
    }
  }

  function linearizeGlobalEquivalence(
    binVar: Var,
    gc: GlobalConstraint,
    originalName: string
  ): void {
    const spec = gc.spec;
    switch (spec.kind) {
      case "distinct": {
        const flatArgs = spec.args.map((a) => flattenLinExprExact(a, originalName));
        if (flatArgs.length <= 1) {
          emitConstraint(
            new Constraint(linExpr([[binVar, 1]], 0), "==", 1, `${originalName}_distinct_triv`),
            originalName
          );
          return;
        }
        const pairs: Constraint[] = [];
        for (let i = 0; i < flatArgs.length; i++) {
          for (let j = i + 1; j < flatArgs.length; j++) {
            pairs.push(new Constraint(flatArgs[i].sub(flatArgs[j]), "!=", 0, `${originalName}_d_${i}_${j}`));
          }
        }
        linearizeElementEquivalence(binVar, new BoolOp("and", pairs), originalName);
        return;
      }

      case "disjoint": {
        const pairs = buildDisjointPairs(spec.tasks, originalName);
        if (pairs.length === 0) {
          emitConstraint(
            new Constraint(linExpr([[binVar, 1]], 0), "==", 1, `${originalName}_disjoint_triv`),
            originalName
          );
          return;
        }
        const pairDisjunctions = pairs.map(({ i, j, sI, dI, sJ, dJ }) =>
          new BoolOp("or", [
            new Constraint(sI.sub(sJ), "<=", -dI, `${originalName}_dj1_${i}_${j}`),
            new Constraint(sJ.sub(sI), "<=", -dJ, `${originalName}_dj2_${i}_${j}`),
          ])
        );
        linearizeElementEquivalence(binVar, new BoolOp("and", pairDisjunctions), originalName);
        return;
      }

      case "cumulative": {
        const core = linearizeCumulativeCore(spec.tasks, spec.capacity, originalName);
        if (core.kind === "empty_domain") {
          emitUnsatConstraint(originalName);
          return;
        }
        if (core.kind === "constant") {
          emitConstraint(
            new Constraint(linExpr([[binVar, 1]], 0), "==", core.value ? 1 : 0, `${originalName}_cum_triv`),
            originalName
          );
          return;
        }
        const { active } = core;
        const perEvent: Constraint[] = [];
        for (let k = 0; k < active.length; k++) {
          const tK = active[k];
          const terms: [Var, number][] = [];
          for (let i = 0; i < active.length; i++) {
            if (i === k) continue;
            const tI = active[i];
            const aIk = new Var({
              name: getUniqueAuxName(`cum_eq_act_${i}_${k}`),
              type: "Binary",
              lb: 0,
              ub: 1,
            });
            variables.push(aIk);
            const activeCond = new BoolOp("and", [
              new Constraint(tI.start.sub(tK.start), "<=", 0, `${originalName}_eq_le_${i}_${k}`),
              new Constraint(tK.start.sub(tI.start), "<=", tI.duration - 1, `${originalName}_eq_ge_${i}_${k}`),
            ]);
            linearizeElementEquivalence(aIk, activeCond, originalName);
            terms.push([aIk, tI.demand]);
          }
          perEvent.push(
            new Constraint(linExpr(terms, 0), "<=", spec.capacity - tK.demand, `${originalName}_ev_${k}`)
          );
        }
        linearizeElementEquivalence(binVar, new BoolOp("and", perEvent), originalName);
        return;
      }

      case "allowed": {
        const flatVars = spec.vars.map((v) => flattenLinExprExact(v, originalName));
        if (spec.tuples.length === 0) {
          emitConstraint(
            new Constraint(linExpr([[binVar, 1]], 0), "==", 0, `${originalName}_allowed_empty`),
            originalName
          );
          return;
        }
        const rowConjunctions = spec.tuples.map((row, r) =>
          new BoolOp(
            "and",
            row.map((val, j) => new Constraint(flatVars[j], "==", val, `${originalName}_eq_tbl_${r}_${j}`))
          )
        );
        linearizeElementEquivalence(binVar, new BoolOp("or", rowConjunctions), originalName);
        return;
      }
    }
  }

  function containsConstraint(el: LogicElement): boolean {
    if (el instanceof Constraint) return true;
    if (el instanceof BoolOp) {
      return el.children.some((c) => containsConstraint(c));
    }
    return false;
  }

  function referencesVar(el: LogicElement, target: Var): boolean {
    if (el instanceof Constraint) {
      if ((el.lhs.terms.get(target) ?? 0) !== 0) return true;
      for (const nl of el.lhs.nonlinearTerms) {
        if (nl.coeff === 0) continue;
        const atom = nl.atom;
        if (atom.kind === "abs" && (atom.arg.terms.get(target) ?? 0) !== 0) return true;
        if ((atom.kind === "max" || atom.kind === "min") && atom.args.some((a) => (a.terms.get(target) ?? 0) !== 0)) {
          return true;
        }
        if (atom.kind === "at" && ((atom.index.terms.get(target) ?? 0) !== 0 || atom.array.some((a) => (a.terms.get(target) ?? 0) !== 0))) {
          return true;
        }
      }
      return false;
    }
    if (el instanceof BoolOp) {
      return el.children.some((c) => referencesVar(c, target));
    }
    return false;
  }

  function linearizeImplication(
    anteBin: Var,
    consequent: LogicElement,
    originalName: string,
    rowNamePrefix: string
  ): void {
    if (consequent instanceof Constraint) {
      linearizeIndicator(anteBin, flattenConstraintExact(consequent, originalName), 1, rowNamePrefix, originalName);
      return;
    }

    if (consequent instanceof BoolVar || consequent instanceof GlobalConstraint) {
      const consBin = getBinVarForBoolElement(consequent, originalName);
      emitConstraint(new Constraint(linExpr([[consBin, 1], [anteBin, -1]], 0), ">=", 0, rowNamePrefix), originalName);
      return;
    }

    if (consequent instanceof BoolOp) {
      if (consequent.op === "and") {
        for (let i = 0; i < consequent.children.length; i++) {
          linearizeImplication(anteBin, consequent.children[i], originalName, `${rowNamePrefix}_and_${i}`);
        }
        return;
      }

      if (consequent.op === "not") {
        const notChild = consequent.children[0];
        if (notChild instanceof Constraint) {
          linearizeNegatedConstraint(anteBin, flattenConstraintExact(notChild, originalName), 1, rowNamePrefix, originalName);
          return;
        }
        if (notChild instanceof BoolOp) {
          if (notChild.op === "not") {
            linearizeImplication(anteBin, notChild.children[0], originalName, rowNamePrefix);
            return;
          }
          if (notChild.op === "or") {
            for (let i = 0; i < notChild.children.length; i++) {
              linearizeImplication(anteBin, new BoolOp("not", [notChild.children[i]]), originalName, `${rowNamePrefix}_not_or_${i}`);
            }
            return;
          }
          if (notChild.op === "and") {
            linearizeImplication(
              anteBin,
              new BoolOp("or", notChild.children.map((sub) => new BoolOp("not", [sub]))),
              originalName,
              rowNamePrefix
            );
            return;
          }
          if (notChild.op === "implies") {
            linearizeImplication(anteBin, notChild.children[0], originalName, `${rowNamePrefix}_not_imp_0`);
            linearizeImplication(anteBin, new BoolOp("not", [notChild.children[1]]), originalName, `${rowNamePrefix}_not_imp_1`);
            return;
          }
        }
        const notChildBin = getBinVarForBoolElement(notChild, originalName);
        emitConstraint(new Constraint(linExpr([[anteBin, 1], [notChildBin, 1]], 0), "<=", 1, rowNamePrefix), originalName);
        return;
      }

      if (consequent.op === "or") {
        if (consequent.children.length === 0) {
          emitConstraint(new Constraint(linExpr([[anteBin, 1]], 0), "<=", 0, rowNamePrefix), originalName);
          return;
        }
        if (consequent.children.length === 1) {
          linearizeImplication(anteBin, consequent.children[0], originalName, rowNamePrefix);
          return;
        }
        if (!consequent.children.some((c) => containsConstraint(c))) {
          const childBins = consequent.children.map((c) => getBinVarForBoolElement(c, originalName));
          const terms: [Var, number][] = [[anteBin, -1], ...childBins.map((cb): [Var, number] => [cb, 1])];
          emitConstraint(new Constraint(linExpr(terms, 0), ">=", 0, rowNamePrefix), originalName);
          return;
        }
        const branchVars: Var[] = [];
        for (let i = 0; i < consequent.children.length; i++) {
          const child = consequent.children[i];
          if (child instanceof BoolVar) {
            branchVars.push(getBinVarForBoolElement(child, originalName));
          } else {
            const z = new Var({ name: getUniqueAuxName(`imp_or_${i}`), type: "Binary", lb: 0, ub: 1 });
            variables.push(z);
            branchVars.push(z);
            linearizeImplication(z, child, originalName, `${rowNamePrefix}_or_${i}`);
          }
        }
        const terms: [Var, number][] = [[anteBin, -1], ...branchVars.map((bv): [Var, number] => [bv, 1])];
        emitConstraint(new Constraint(linExpr(terms, 0), ">=", 0, rowNamePrefix), originalName);
        return;
      }

      if (consequent.op === "implies") {
        const [subAnte, subCons] = consequent.children;
        let subAnteBin: Var;
        if (subAnte instanceof Constraint) {
          const flatSubAnte = flattenConstraintExact(subAnte, originalName);
          subAnteBin = new Var({ name: getUniqueAuxName("ante"), type: "Binary", lb: 0, ub: 1 });
          variables.push(subAnteBin);
          linearizeNegatedConstraint(subAnteBin, flatSubAnte, 0, `${rowNamePrefix}_ante_neg`, originalName);
        } else {
          subAnteBin = getBinVarForBoolElement(subAnte, originalName);
        }
        if (subCons instanceof BoolVar) {
          const consBin = getBinVarForBoolElement(subCons, originalName);
          emitConstraint(
            new Constraint(linExpr([[consBin, 1], [anteBin, -1], [subAnteBin, -1]], 0), ">=", -1, rowNamePrefix),
            originalName
          );
          return;
        }
        const jointBin = new Var({ name: getUniqueAuxName("imp_joint"), type: "Binary", lb: 0, ub: 1 });
        variables.push(jointBin);
        emitConstraint(
          new Constraint(linExpr([[jointBin, 1], [anteBin, -1], [subAnteBin, -1]], 0), ">=", -1, `${rowNamePrefix}_joint`),
          originalName
        );
        linearizeImplication(jointBin, subCons, originalName, rowNamePrefix);
        return;
      }

      const consBin = getBinVarForBoolElement(consequent, originalName);
      emitConstraint(new Constraint(linExpr([[consBin, 1], [anteBin, -1]], 0), ">=", 0, rowNamePrefix), originalName);
      return;
    }

    throw new Error(`Unsupported logical element in implication consequent "${originalName}": ${consequent}`);
  }

  function linearizeTopLevelElement(
    el: LogicElement,
    originalName: string,
    rowNamePrefix: string = originalName
  ): void {
    if (el instanceof Constraint) {
      lowerTopLevelLinearRow(el.lhs, el.sense, el.rhs, rowNamePrefix, originalName);
      return;
    }

    if (el instanceof GlobalConstraint) {
      linearizeGlobalTopLevel(el, true, originalName);
      return;
    }

    // Case A: Pure BoolVar: el == true  <=>  binVar >= 1
    if (el instanceof BoolVar) {
      const binVar = getBinVarForBoolElement(el, originalName);
      emitConstraint(new Constraint(linExpr([[binVar, 1]], 0), ">=", 1, rowNamePrefix), originalName);
      return;
    }

    // Case B: BoolOp
    if (el instanceof BoolOp) {
      // B.1 NOT: not(child)  <=>  child == false
      if (el.op === "not") {
        const child = el.children[0];
        if (child instanceof BoolVar) {
          const binVar = getBinVarForBoolElement(child, originalName);
          emitConstraint(new Constraint(linExpr([[binVar, 1]], 0), "<=", 0, rowNamePrefix), originalName);
          return;
        }
        if (child instanceof GlobalConstraint) {
          linearizeGlobalTopLevel(child, false, originalName);
          return;
        }
        if (child instanceof Constraint) {
          linearizeTopLevelNegatedConstraint(flattenConstraintExact(child, originalName), originalName);
          return;
        }
        if (child instanceof BoolOp) {
          if (child.op === "not") {
            linearizeTopLevelElement(child.children[0], originalName, rowNamePrefix);
            return;
          }
          if (child.op === "or") {
            for (let i = 0; i < child.children.length; i++) {
              linearizeTopLevelElement(new BoolOp("not", [child.children[i]]), originalName, `${rowNamePrefix}_not_or_${i}`);
            }
            return;
          }
          if (child.op === "and") {
            linearizeTopLevelElement(
              new BoolOp("or", child.children.map((sub) => new BoolOp("not", [sub]))),
              originalName,
              rowNamePrefix
            );
            return;
          }
          if (child.op === "implies") {
            linearizeTopLevelElement(child.children[0], originalName, `${rowNamePrefix}_not_imp_0`);
            linearizeTopLevelElement(new BoolOp("not", [child.children[1]]), originalName, `${rowNamePrefix}_not_imp_1`);
            return;
          }
        }
        // not of xor / remaining compound: aux == 0
        const aux = getBinVarForBoolElement(child, originalName);
        emitConstraint(new Constraint(linExpr([[aux, 1]], 0), "<=", 0, rowNamePrefix), originalName);
        return;
      }

      // B.2 AND: and(c1, c2, ...)  <=>  each child must hold as a top-level constraint
      if (el.op === "and") {
        for (let i = 0; i < el.children.length; i++) {
          linearizeTopLevelElement(el.children[i], originalName, `${rowNamePrefix}_and_${i}`);
        }
        return;
      }

      // B.3 OR: or(c1, c2, ...)
      if (el.op === "or") {
        if (el.children.length === 0) {
          emitUnsatConstraint(originalName);
          return;
        }
        if (el.children.length === 1) {
          linearizeTopLevelElement(el.children[0], originalName, rowNamePrefix);
          return;
        }
        // If no child contains a Constraint, handle via getBinVarForBoolElement and sum(childBins) >= 1
        if (!el.children.some((c) => containsConstraint(c))) {
          const childBins = el.children.map((c) => getBinVarForBoolElement(c, originalName));
          const terms: [Var, number][] = childBins.map((cb) => [cb, 1]);
          emitConstraint(new Constraint(linExpr(terms, 0), ">=", 1, rowNamePrefix), originalName);
          return;
        }

        // If children include comparison constraints (directly or nested in positive/negative positions):
        // For each non-BoolVar child c_i, introduce aux y_i, enforce one-way y_i => c_i, and sum >= 1
        const branchVars: Var[] = [];
        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i];
          if (child instanceof BoolVar) {
            branchVars.push(getBinVarForBoolElement(child, originalName));
          } else {
            const y = new Var({ name: getUniqueAuxName(`or_branch_${i}`), type: "Binary", lb: 0, ub: 1 });
            variables.push(y);
            branchVars.push(y);
            linearizeImplication(y, child, originalName, `${rowNamePrefix}_or_${i}`);
          }
        }
        const sumTerms: [Var, number][] = branchVars.map((y) => [y, 1]);
        emitConstraint(new Constraint(linExpr(sumTerms, 0), ">=", 1, rowNamePrefix), originalName);
        return;
      }

      // B.4 XOR: parity fold
      if (el.op === "xor") {
        if (el.children.length === 0) {
          // xor() == false, but top-level asserts true -> Infeasible
          emitUnsatConstraint(originalName);
          return;
        }
        if (el.children.length === 1) {
          linearizeTopLevelElement(el.children[0], originalName, rowNamePrefix);
          return;
        }
        const childBins = el.children.map((c) => getBinVarForBoolElement(c, originalName));
        if (childBins.length === 2) {
          emitConstraint(
            new Constraint(linExpr([[childBins[0], 1], [childBins[1], 1]], 0), "==", 1, rowNamePrefix),
            originalName
          );
          return;
        }
        // Variadic XOR parity fold: (a ^ b) ^ c ... == 1
        let currentBin = childBins[0];
        for (let i = 1; i < childBins.length - 1; i++) {
          const nextAux = new Var({ name: getUniqueAuxName(`xor_fold_${i}`), type: "Binary", lb: 0, ub: 1 });
          variables.push(nextAux);
          linearizeBinaryXorEquivalence(nextAux, currentBin, childBins[i], `${rowNamePrefix}_xor_fold_${i}`);
          currentBin = nextAux;
        }
        const lastBin = childBins[childBins.length - 1];
        emitConstraint(
          new Constraint(linExpr([[currentBin, 1], [lastBin, 1]], 0), "==", 1, rowNamePrefix),
          originalName
        );
        return;
      }

      // B.5 IMPLIES: antecedent => consequent
      if (el.op === "implies") {
        const [antecedent, consequent] = el.children;
        const directBin = antecedent instanceof Constraint ? matchDirectBinaryCondition(antecedent) : null;

        if (directBin !== null) {
          if (consequent instanceof Constraint) {
            const flatCons = flattenConstraintExact(consequent, originalName);
            if ((flatCons.lhs.terms.get(directBin.binVar) ?? 0) === 0) {
              linearizeIndicator(directBin.binVar, flatCons, directBin.activeVal, rowNamePrefix, originalName);
              return;
            }
          }
          if (consequent instanceof BoolVar) {
            const consBin = getBinVarForBoolElement(consequent, originalName);
            const c =
              directBin.activeVal === 1
                ? new Constraint(linExpr([[consBin, 1], [directBin.binVar, -1]], 0), ">=", 0, rowNamePrefix)
                : new Constraint(linExpr([[consBin, 1], [directBin.binVar, 1]], 0), ">=", 1, rowNamePrefix);
            emitConstraint(c, originalName);
            return;
          }
          if (consequent instanceof BoolOp && consequent.op === "not") {
            const notTarget = consequent.children[0];
            if (notTarget instanceof BoolVar) {
              const consBin = getBinVarForBoolElement(notTarget, originalName);
              const c =
                directBin.activeVal === 1
                  ? new Constraint(linExpr([[consBin, 1], [directBin.binVar, 1]], 0), "<=", 1, rowNamePrefix)
                  : new Constraint(linExpr([[consBin, 1], [directBin.binVar, -1]], 0), "<=", 0, rowNamePrefix);
              emitConstraint(c, originalName);
              return;
            }
            if (notTarget instanceof Constraint) {
              const flatNotTarget = flattenConstraintExact(notTarget, originalName);
              if ((flatNotTarget.lhs.terms.get(directBin.binVar) ?? 0) === 0) {
                linearizeNegatedConstraint(directBin.binVar, flatNotTarget, directBin.activeVal, rowNamePrefix, originalName);
                return;
              }
            }
          }
          if (directBin.activeVal === 1 && !referencesVar(consequent, directBin.binVar)) {
            linearizeImplication(directBin.binVar, consequent, originalName, rowNamePrefix);
            return;
          }
        }

        // General antecedent: introduce aux binary anteBin and enforce contrapositive
        let anteBin: Var;
        if (antecedent instanceof Constraint) {
          const flatAnte = flattenConstraintExact(antecedent, originalName);
          anteBin = new Var({ name: getUniqueAuxName("ante"), type: "Binary", lb: 0, ub: 1 });
          variables.push(anteBin);
          linearizeNegatedConstraint(anteBin, flatAnte, 0, `${rowNamePrefix}_ante_neg`, originalName);
        } else {
          anteBin = getBinVarForBoolElement(antecedent, originalName);
        }

        linearizeImplication(anteBin, consequent, originalName, rowNamePrefix);
        return;
      }
    }

    throw new Error(`Unsupported top-level logical constraint "${originalName}": ${el}`);
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

  function asEqualityConstraint(c: Constraint): Constraint {
    return new Constraint(c.lhs, "==", c.rhs, c.name);
  }

  function linearizeIndicator(
    binVar: Var,
    targetConstraint: Constraint,
    activeVal: 0 | 1,
    constraintName: string,
    originalName: string
  ): void {
    const flat = flattenConstraintExact(targetConstraint, originalName);
    if (flat.sense === "!=") {
      linearizeNegatedConstraint(binVar, asEqualityConstraint(flat), activeVal, constraintName, originalName);
      return;
    }
    const { lhs, sense, rhs } = flat;
    if (sense === "==") {
      emitSingleIndicator(binVar, lhs, "<=", rhs, activeVal, `${constraintName}_le`, originalName);
      emitSingleIndicator(binVar, lhs, ">=", rhs, activeVal, `${constraintName}_ge`, originalName);
    } else {
      emitSingleIndicator(binVar, lhs, sense, rhs, activeVal, constraintName, originalName);
    }
  }

  function emitUnsatConstraint(originalName: string): void {
    const dummy = new Var({ name: getUniqueAuxName("unsat"), type: "Binary", lb: 0, ub: 1 });
    variables.push(dummy);
    emitConstraint(new Constraint(linExpr([[dummy, 1]], 0), ">=", 2, originalName), originalName);
  }

  function linearizeTopLevelConstraint(targetConstraint: Constraint, originalName: string): void {
    const flat = flattenConstraintExact(targetConstraint, originalName);
    const { lhs, sense, rhs } = flat;
    if (sense === "!=") {
      linearizeTopLevelNegatedConstraint(asEqualityConstraint(flat), originalName);
      return;
    }
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
    emitConstraint(new Constraint(linExpr(nonZeroTerms, 0), sense, effectiveRhs, targetConstraint.name || originalName), originalName);
  }

  function linearizeTopLevelNegatedConstraint(targetConstraint: Constraint, originalName: string): void {
    const flat = flattenConstraintExact(targetConstraint, originalName);
    if (flat.sense === "!=") {
      linearizeTopLevelConstraint(asEqualityConstraint(flat), originalName);
      return;
    }
    const neg = negateIntegerConstraint(flat, originalName);
    if (neg.kind === "always_true") return;
    if (neg.kind === "always_false") {
      emitUnsatConstraint(originalName);
      return;
    }
    if (neg.kind === "single") {
      emitConstraint(new Constraint(neg.lhs, neg.sense, neg.rhs, flat.name || originalName), originalName);
      return;
    }
    // Disjunction (lhs <= ltRhs) OR (lhs >= gtRhs) with a SINGLE binary selector dirBin
    const dirBin = new Var({ name: getUniqueAuxName("neq_dir"), type: "Binary", lb: 0, ub: 1 });
    variables.push(dirBin);
    const baseRowName = flat.name || originalName;
    emitSingleIndicator(dirBin, neg.lhs, "<=", neg.ltRhs, 1, `${baseRowName}_lt`, originalName);
    emitSingleIndicator(dirBin, neg.lhs, ">=", neg.gtRhs, 0, `${baseRowName}_gt`, originalName);
  }

  // Enforces: binVar == activeVal => not(targetConstraint)
  function linearizeNegatedConstraint(
    binVar: Var,
    targetConstraint: Constraint,
    activeVal: 0 | 1,
    constraintName: string,
    originalName: string
  ): void {
    const flat = flattenConstraintExact(targetConstraint, originalName);
    if (flat.sense === "!=") {
      linearizeIndicator(binVar, asEqualityConstraint(flat), activeVal, constraintName, originalName);
      return;
    }
    const neg = negateIntegerConstraint(flat, originalName);
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

  // 2. Lower any baseConstraints containing `!=` or `nonlinearTerms`
  for (const c of loweredBaseConstraints) {
    lowerTopLevelLinearRow(c.lhs, c.sense, c.rhs, c.name, c.name);
  }

  // 3. Lower objective nonlinear terms (if requested)
  let loweredObjective: LinExpr | QuadExpr | undefined;
  if (objectiveInfo && objectiveInfo.expr.hasNonlinearTerms()) {
    const isMin = normalizeSense(objectiveInfo.sense) === "Minimize";
    const objExpr = objectiveInfo.expr;
    const newLinTerms = new Map<Var, number>(
      objExpr instanceof QuadExpr ? objExpr.linearTerms : objExpr.terms
    );
    let newConst = objExpr.constant;

    for (const term of objExpr.nonlinearTerms) {
      if (term.coeff === 0) continue;
      const polarity: "upper" | "lower" = (isMin ? term.coeff > 0 : term.coeff < 0)
        ? "upper"
        : "lower";
      const rep = lowerAtomWithPolarity(term.atom, polarity, "__objective");
      newConst += term.coeff * rep.constant;
      for (const [v, vc] of rep.terms.entries()) {
        const next = (newLinTerms.get(v) ?? 0) + term.coeff * vc;
        if (next === 0) newLinTerms.delete(v);
        else newLinTerms.set(v, next);
      }
    }

    if (objExpr instanceof QuadExpr) {
      loweredObjective = new QuadExpr(newLinTerms, objExpr.quadTerms, newConst, []);
    } else {
      loweredObjective = new LinExpr(newLinTerms, newConst, []);
    }
  } else if (objectiveInfo) {
    loweredObjective = objectiveInfo.expr;
  }

  // 4. Linearize each top-level logical constraint
  for (const item of logicalConstraints) {
    const origName = item.name;
    const el = item.expr;
    linearizeTopLevelElement(el, origName);
  }

  return {
    variables,
    constraints,
    boolVarToBinary,
    constraintToOriginalName,
    ...(loweredObjective !== undefined ? { objective: loweredObjective } : {}),
  };
}

type NegatedIntegerConstraint =
  | { kind: "always_true" }
  | { kind: "always_false" }
  | { kind: "single"; lhs: LinExpr; sense: "<=" | ">="; rhs: number }
  | { kind: "disjunction"; lhs: LinExpr; ltRhs: number; gtRhs: number };

function matchDirectBinaryCondition(c: Constraint): { binVar: Var; activeVal: 0 | 1 } | null {
  if (c.lhs.hasNonlinearTerms() || c.lhs.terms.size !== 1 || (c.lhs.constant ?? 0) !== 0) return null;
  const [[v, coeff]] = Array.from(c.lhs.terms.entries());
  const isBin = (v.type === "Binary" || v.type === "Integer") && v.lb === 0 && v.ub === 1;
  if (!isBin || coeff !== 1) return null;
  if ((c.sense === "==" && c.rhs === 1) || (c.sense === ">=" && c.rhs === 1) || (c.sense === "!=" && c.rhs === 0)) {
    return { binVar: v, activeVal: 1 };
  }
  if ((c.sense === "==" && c.rhs === 0) || (c.sense === "<=" && c.rhs === 0) || (c.sense === "!=" && c.rhs === 1)) {
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
  if (lhs.hasNonlinearTerms()) {
    throw new Error(
      `Cannot negate unlowered nonlinear constraint "${targetConstraint.name}" in "${originalName}".`
    );
  }
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

  const termsOnlyLhs = linExpr(nonZeroTerms, 0);
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
