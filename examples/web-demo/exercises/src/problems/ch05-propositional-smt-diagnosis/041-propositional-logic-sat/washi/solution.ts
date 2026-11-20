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
  if ("implies" in node) {
    return implies(compileFormula(node.implies[0], bools), compileFormula(node.implies[1], bools));
  }
  return xor(...node.xor.map((c) => compileFormula(c, bools)));
}

export async function solve(input: P041Input): Promise<P041Output> {
  const m = new Model("PropositionalSAT");
  const bools = m.bool(input.vars);

  input.rules.forEach((rule, i) => {
    m.constraint(compileFormula(rule, bools), `rule_${i}`);
  });

  const res = await m.check({ solver: "z3" });
  if (res.status !== "Sat") {
    return { satisfiable: false, assignment: null };
  }

  const assignment: Record<string, boolean> = {};
  for (const name of input.vars) {
    assignment[name] = Boolean(bools[name].value);
  }
  return { satisfiable: true, assignment };
}
