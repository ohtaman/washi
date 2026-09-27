import type { Var } from "./variable.js";
import type { LinExpr } from "./expression.js";
import type { Constraint } from "./constraint.js";
import type { OptimizationSense } from "./types.js";
import { QuadExpr } from "./quad-expr.js";

export interface LpModelData {
  name?: string;
  sense: OptimizationSense;
  objective: LinExpr | QuadExpr;
  constraints: Constraint[];
  variables: Var[];
}

export interface LpExportResult {
  lpString: string;
  /** Maps sanitized name in LP to original Var */
  nameToVar: Map<string, Var>;
  /** Maps sanitized name in LP to original Constraint */
  nameToConstraint: Map<string, Constraint>;
}

/**
 * Sanitize variable and constraint names to be valid CPLEX LP identifiers:
 * Allowed chars: a-z, A-Z, 0-9, _, !, ", #, $, %, &, (, ), /, ?, @, ~, '
 * Avoid +, -, *, :, <, >, =, [, ], spaces
 */
export function sanitizeIdentifier(raw: string, fallbackPrefix: string, id: number): string {
  // Replace invalid characters with underscore
  let s = raw.replace(/[^a-zA-Z0-9_]/g, "_");
  // Cannot start with a number or dot
  if (/^[0-9]/.test(s)) {
    s = `${fallbackPrefix}_${s}`;
  }
  if (!s || s.length === 0) {
    s = `${fallbackPrefix}_${id}`;
  }
  return s;
}

/**
 * Convert a linear or quadratic model to standard CPLEX LP format string
 */
export function generateLpString(modelData: LpModelData): LpExportResult {
  const { sense, objective, constraints, variables } = modelData;

  const nameToVar = new Map<string, Var>();
  const varToName = new Map<Var, string>();
  const nameToConstraint = new Map<string, Constraint>();

  // Ensure unique sanitized names for all variables
  const usedVarNames = new Set<string>();
  for (const v of variables) {
    let clean = sanitizeIdentifier(v.name, "x", v.id);
    let unique = clean;
    let count = 1;
    while (usedVarNames.has(unique)) {
      unique = `${clean}_${count++}`;
    }
    usedVarNames.add(unique);
    varToName.set(v, unique);
    nameToVar.set(unique, v);
  }

  // Ensure unique sanitized names for all constraints
  const usedConstrNames = new Set<string>();
  const constrToName = new Map<Constraint, string>();
  for (const c of constraints) {
    let clean = sanitizeIdentifier(c.name, "c", c.id);
    let unique = clean;
    let count = 1;
    while (usedConstrNames.has(unique)) {
      unique = `${clean}_${count++}`;
    }
    usedConstrNames.add(unique);
    constrToName.set(c, unique);
    nameToConstraint.set(unique, c);
  }

  const lines: string[] = [];

  // 1. Objective Section
  lines.push(sense === "Maximize" ? "Maximize" : "Minimize");
  const objTerms: string[] = [];
  let isFirst = true;

  // Extract linear terms
  const linTerms = objective instanceof QuadExpr ? objective.linearTerms : objective.terms;
  if (linTerms) {
    for (const [v, coeff] of linTerms) {
      if (Math.abs(coeff) < 1e-12) continue;
      const vName = varToName.get(v)!;
      const sign = coeff >= 0 ? (isFirst ? "" : "+ ") : "- ";
      const absCoeff = Math.abs(coeff);
      const coeffStr = absCoeff === 1 ? "" : `${absCoeff} `;
      objTerms.push(`${sign}${coeffStr}${vName}`);
      isFirst = false;
    }
  }

  // Extract quadratic terms if objective is QuadExpr
  if (objective instanceof QuadExpr && objective.quadTerms.size > 0) {
    const quadParts: string[] = [];
    let isFirstQuad = true;

    for (const term of objective.quadTerms.values()) {
      if (Math.abs(term.coeff) < 1e-12) continue;
      // In CPLEX LP format [ Q ] / 2, the expression inside bracket is multiplied by 1/2.
      // Thus, each term x1*x2 with coefficient c is represented as (2*c) inside [ ... ] / 2.
      const doubleCoeff = 2 * term.coeff;
      const sign = doubleCoeff >= 0 ? (isFirstQuad ? "" : "+ ") : "- ";
      const absCoeff = Math.abs(doubleCoeff);
      const coeffStr = absCoeff === 1 ? "" : `${absCoeff} `;
      const v1Name = varToName.get(term.var1)!;
      const v2Name = varToName.get(term.var2)!;

      if (term.var1 === term.var2) {
        quadParts.push(`${sign}${coeffStr}${v1Name} ^ 2`);
      } else {
        quadParts.push(`${sign}${coeffStr}${v1Name} * ${v2Name}`);
      }
      isFirstQuad = false;
    }

    if (quadParts.length > 0) {
      const quadString = `[ ${quadParts.join(" ")} ] / 2`;
      if (objTerms.length > 0) {
        objTerms.push("+", quadString);
      } else {
        objTerms.push(quadString);
      }
    }
  }

  const objBody = objTerms.length > 0 ? objTerms.join(" ") : "0";
  lines.push(` obj: ${objBody}`);

  // 2. Constraints Section
  lines.push("Subject To");
  for (const c of constraints) {
    const cName = constrToName.get(c)!;
    const terms: string[] = [];
    let firstTerm = true;

    for (const [v, coeff] of c.lhs.terms) {
      if (Math.abs(coeff) < 1e-12) continue;
      const vName = varToName.get(v)!;
      const sign = coeff >= 0 ? (firstTerm ? "" : "+ ") : "- ";
      const absCoeff = Math.abs(coeff);
      const coeffStr = absCoeff === 1 ? "" : `${absCoeff} `;
      terms.push(`${sign}${coeffStr}${vName}`);
      firstTerm = false;
    }

    const lhsBody = terms.length > 0 ? terms.join(" ") : "0";
    const op = c.sense === "==" ? "=" : c.sense;
    lines.push(` ${cName}: ${lhsBody} ${op} ${c.rhs}`);
  }

  // 3. Bounds Section
  lines.push("Bounds");
  const integerVars: string[] = [];
  const binaryVars: string[] = [];

  for (const v of variables) {
    const vName = varToName.get(v)!;

    if (v.type === "Binary") {
      binaryVars.push(vName);
      continue;
    }

    if (v.type === "Integer") {
      integerVars.push(vName);
    }

    // Bounds formatting
    const lbIsInf = v.lb === -Infinity;
    const ubIsInf = v.ub === Infinity;

    if (lbIsInf && ubIsInf) {
      lines.push(` ${vName} free`);
    } else if (lbIsInf && !ubIsInf) {
      lines.push(` -infinity <= ${vName} <= ${v.ub}`);
    } else if (!lbIsInf && ubIsInf) {
      if (v.lb !== 0) {
        lines.push(` ${vName} >= ${v.lb}`);
      }
      // If lb === 0 and ub === Infinity, default in LP is 0 <= x <= inf, but explicitly writing it is safe:
      // lines.push(` 0 <= ${vName} <= +infinity`);
    } else {
      lines.push(` ${v.lb} <= ${vName} <= ${v.ub}`);
    }
  }

  // 4. Generals Section (Integers)
  if (integerVars.length > 0) {
    lines.push("Generals");
    // Split into chunks of 10 for clean readability
    for (let i = 0; i < integerVars.length; i += 10) {
      lines.push(` ` + integerVars.slice(i, i + 10).join(" "));
    }
  }

  // 5. Binary Section
  if (binaryVars.length > 0) {
    lines.push("Binary");
    for (let i = 0; i < binaryVars.length; i += 10) {
      lines.push(` ` + binaryVars.slice(i, i + 10).join(" "));
    }
  }

  // 6. End
  lines.push("End");

  return {
    lpString: lines.join("\n") + "\n",
    nameToVar,
    nameToConstraint,
  };
}
