import {
  Model,
  and,
  dot,
  expr,
  implies,
  minimize,
  not,
  or,
  xor,
  type BoolVar,
  type LogicInput,
} from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export type PropFormula =
  | string
  | { not: PropFormula }
  | { and: PropFormula[] }
  | { or: PropFormula[] }
  | { implies: [PropFormula, PropFormula] }
  | { xor: PropFormula[] };

export interface SoftRule {
  id: string;
  weight: number;
  expr: PropFormula;
}

export interface P047Input {
  vars: string[];
  hardRules: PropFormula[];
  softRules: SoftRule[];
}

export interface P047Output {
  assignment: Record<string, boolean>;
  violatedRules: string[];
  totalPenalty: number;
}

function compileFormula(node: PropFormula, bools: Record<string, BoolVar>): LogicInput {
  if (typeof node === "string") return bools[node];
  if ("not" in node) return not(compileFormula(node.not, bools));
  if ("and" in node) return and(...node.and.map((c) => compileFormula(c, bools)));
  if ("or" in node) return or(...node.or.map((c) => compileFormula(c, bools)));
  if ("implies" in node) {
    return implies(compileFormula(node.implies[0], bools), compileFormula(node.implies[1], bools));
  }
  return xor(...node.xor.map((c) => compileFormula(c, bools)));
}

export async function solve(input: P047Input): Promise<P047Output> {
  const m = new Model("WeightedMaxSAT");
  const bools = m.bool(input.vars);

  input.hardRules.forEach((rule, i) => {
    m.constraint(compileFormula(rule, bools), `hard_${i}`);
  });

  const violated = m.binary(input.softRules.length, { prefix: "viol" });
  const weights = input.softRules.map((s) => s.weight);

  input.softRules.forEach((s, k) => {
    const cond = compileFormula(s.expr, bools);
    m.constraint(or(cond, expr`${violated[k]} == 1`), `soft_${s.id}`);
    m.constraint(implies(cond, expr`${violated[k]} == 0`), `tight_${s.id}`);
  });

  if (violated.length > 0) {
    m.objective(minimize(dot(weights, violated)));
  }

  await m.solve({ solver: "z3" });

  const assignment: Record<string, boolean> = {};
  for (const name of input.vars) {
    assignment[name] = Boolean(bools[name].value);
  }
  const violatedRules = input.softRules
    .filter((_, k) => Math.round(violated[k].value!) === 1)
    .map((s) => s.id)
    .sort();
  const totalPenalty = input.softRules.reduce(
    (acc, s, k) => acc + (Math.round(violated[k].value!) === 1 ? s.weight : 0),
    0
  );

  return { assignment, violatedRules, totalPenalty };
}
