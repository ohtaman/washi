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

export interface NamedHardRule {
  id: string;
  expr: SmtFormula;
}

export interface NamedSoftRule {
  id: string;
  weight: number;
  expr: SmtFormula;
}

export interface P050Input {
  boolVars: string[];
  intVars: Array<{ name: string; lb: number; ub: number }>;
  hardRules: NamedHardRule[];
  softRules: NamedSoftRule[];
}

export interface P050Output {
  consistent: boolean;
  minimalCore: string[];
  relaxedRules: string[];
  repairCost: number;
  repairedAssignment: Record<string, boolean | number>;
}

export async function solve(input: P050Input): Promise<P050Output> {
  // TODO:
  // 1. Check joint consistency of hardRules + softRules using m.check({ solver: "z3" }).
  //    If "Sat", return { consistent: true, minimalCore: [], relaxedRules: [], repairCost: 0, repairedAssignment }.
  // 2. If "Unsat", extract a minimal unsatisfiable subset (minimalCore) via res.unsatCore + deletion contraction.
  // 3. Solve a weighted MaxSAT repair model over hardRules + relaxed softRules via m.solve({ solver: "z3" })
  //    to compute minimum-weight relaxedRules, repairCost, and repairedAssignment.
  throw new Error("Not implemented");
}
