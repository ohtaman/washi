import {
  Model,
  and,
  implies,
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

export interface TriggerRule {
  id: string;
  condition: PropFormula;
  effect: PropFormula;
}

export interface P045Input {
  vars: string[];
  baseRules: PropFormula[];
  rules: TriggerRule[];
}

export interface P045Output {
  deadRules: string[];
  redundantRules: string[];
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

export async function solve(input: P045Input): Promise<P045Output> {
  // TODO:
  // Iterate sequentially over rule r in input.rules against prior = [...baseRules, ...earlierRules]:
  // 1. Check satisfiability of [...prior, r.condition] via Z3: if "Unsat", push r.id to deadRules.
  // 2. Otherwise check [...prior, r.condition, { not: r.effect }] via Z3: if "Unsat", push r.id to redundantRules.
  // 3. Append implies(r.condition, r.effect) to prior, and return both arrays sorted lexicographically.
  throw new Error("Not implemented");
}
