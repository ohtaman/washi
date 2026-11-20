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
  const bools = m.bool(input.boolVars);
  const ints: Record<string, Var> = {};
  for (const spec of input.intVars) {
    ints[spec.name] = m.integer(spec.name, { lb: spec.lb, ub: spec.ub });
  }

  // TODO:
  // 1. Add all rules from input.rules as constraints on m.
  // 2. Assert the negation of input.safeInvariant: not(compileSmt(input.safeInvariant, bools, ints)).
  // 3. Call await m.check({ solver: "z3" }).
  //    If "Sat", return { hasViolation: true, counterexample }; if "Unsat", return { hasViolation: false, counterexample: null }.
  throw new Error("Not implemented");
}
