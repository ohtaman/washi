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

export interface P041Input {
  vars: string[];
  rules: PropFormula[];
}

export interface P041Output {
  satisfiable: boolean;
  assignment: Record<string, boolean> | null;
}

function compileFormula(node: PropFormula, bools: Record<string, BoolVar>): LogicInput {
  if (typeof node === "string") return bools[node];
  if ("not" in node) return not(compileFormula(node.not, bools));
  if ("and" in node) return and(...node.and.map((c) => compileFormula(c, bools)));
  if ("or" in node) return or(...node.or.map((c) => compileFormula(c, bools)));
  // TODO: Implement the "implies" and "xor" branches using implies(...) and xor(...)
  throw new Error("Not implemented: handle implies and xor");
}

export async function solve(input: P041Input): Promise<P041Output> {
  const m = new Model("PropositionalSAT");
  const bools = m.bool(input.vars);

  // TODO: Register each compiled rule on m, call await m.check({ solver: "z3" }),
  // and return { satisfiable: true, assignment } when res.status === "Sat",
  // or { satisfiable: false, assignment: null } otherwise.
  input.rules.forEach((rule, i) => {
    m.constraint(compileFormula(rule, bools), `rule_${i}`);
  });
  throw new Error("Not implemented");
}
