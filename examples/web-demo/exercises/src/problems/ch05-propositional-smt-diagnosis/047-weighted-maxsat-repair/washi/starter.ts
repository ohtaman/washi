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
  // TODO: Enforce all hard rules, relax soft rules with weighted penalty indicators, and minimize total penalty with Z3.
  throw new Error("Not implemented");
}
