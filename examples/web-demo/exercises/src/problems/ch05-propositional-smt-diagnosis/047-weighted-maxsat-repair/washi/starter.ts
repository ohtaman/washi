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

export async function solve(input: P047Input): Promise<P047Output> {
  // TODO:
  // 1. Create m.bool(input.vars) and assert every rule in input.hardRules.
  // 2. For each soft rule k, create a binary relaxation indicator viol[k] = m.binary(...) and assert:
  //    or(softExpr[k], expr`${viol[k]} == 1`).
  // 3. Minimize dot(weights, viol) with await m.solve({ solver: "z3" }) and return
  //    { assignment, violatedRules, totalPenalty }.
  throw new Error("Not implemented");
}
