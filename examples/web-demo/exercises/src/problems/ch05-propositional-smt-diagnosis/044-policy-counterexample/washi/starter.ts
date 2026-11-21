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

export interface P044Input {
  boolVars: string[];
  intVars: Array<{ name: string; lb: number; ub: number }>;
  rules: SmtFormula[];
  safeInvariant: SmtFormula;
}

export interface P044Output {
  hasViolation: boolean;
  counterexample: Record<string, boolean | number> | null;
}

function compileSmt(
  node: SmtFormula,
  bools: Record<string, BoolVar>,
  ints: Record<string, Var>
): LogicInput {
  if (typeof node === "string") return bools[node];
  if ("not" in node) return not(compileSmt(node.not, bools, ints));
  if ("and" in node) return and(...node.and.map((c) => compileSmt(c, bools, ints)));
  if ("or" in node) return or(...node.or.map((c) => compileSmt(c, bools, ints)));
  if ("implies" in node) {
    return implies(
      compileSmt(node.implies[0], bools, ints),
      compileSmt(node.implies[1], bools, ints)
    );
  }
  if ("xor" in node) return xor(...node.xor.map((c) => compileSmt(c, bools, ints)));
  let lhs = expr`0`;
  for (const [name, coeff] of Object.entries(node.terms)) {
    lhs = lhs.add(ints[name].mul(coeff));
  }
  if (node.sense === "<=") return lhs.le(node.rhs);
  if (node.sense === ">=") return lhs.ge(node.rhs);
  if (node.sense === "==") return lhs.eq(node.rhs);
  return lhs.ne(node.rhs);
}

export async function solve(input: P044Input): Promise<P044Output> {
  const m = new Model("PolicyCounterexample");

  // TODO: Declare Boolean and bounded integer variables, encode the policy and safety check, and solve with Z3.
  throw new Error("Not implemented");
}
