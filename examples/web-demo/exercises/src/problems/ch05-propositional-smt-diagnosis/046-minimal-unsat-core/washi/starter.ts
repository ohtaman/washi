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
  // TODO: Extract an irreducible minimal unsatisfiable subset (MUS) of rule IDs using Z3 and return them sorted.
  throw new Error("Not implemented");
}
