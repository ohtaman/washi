import {
  Model,
  and,
  expr,
  implies,
  not,
  or,
  xor,
  type BoolVar,
  type LogicInput,
  type Var,
} from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export interface SmtCmp {
  terms: Record<string, number>;
  sense: "<=" | ">=" | "==" | "!=";
  rhs: number;
}

export type SmtFormula =
  | string
  | { not: SmtFormula }
  | { and: SmtFormula[] }
  | { or: SmtFormula[] }
  | { implies: [SmtFormula, SmtFormula] }
  | { xor: SmtFormula[] }
  | SmtCmp;

export interface NamedSmtRule {
  id: string;
  expr: SmtFormula;
}

export interface P046Input {
  boolVars: string[];
  intVars: Array<{ name: string; lb: number; ub: number }>;
  rules: NamedSmtRule[];
}

export interface P046Output {
  coreRules: string[];
}

export async function solve(input: P046Input): Promise<P046Output> {
  // TODO:
  // 1. Build a WaSHI Model with named constraints for every rule (r.id) and call await m.check({ solver: "z3" }).
  // 2. Seed candidate core with res.unsatCore (or all rule IDs).
  // 3. Run deletion-based contraction: for each ruleId in candidate, check candidate \ {ruleId} on a fresh Model;
  //    if still "Unsat", drop ruleId (or shrink to the returned unsatCore).
  // 4. Return { coreRules: core.sort() }.
  throw new Error("Not implemented");
}
