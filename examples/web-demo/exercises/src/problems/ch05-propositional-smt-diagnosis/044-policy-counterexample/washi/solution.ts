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

// Compile a mixed Boolean + linear-integer-arithmetic (SMT) AST into WaSHI expressions
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
  // Linear arithmetic comparison leaf: sum(coeff * var) <sense> rhs
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
  // bools: Boolean policy flags; ints: bounded integer state variables
  const bools = m.bool(input.boolVars);
  const ints: Record<string, Var> = {};
  for (const spec of input.intVars) {
    ints[spec.name] = m.integer(spec.name, { lb: spec.lb, ub: spec.ub });
  }

  // Assert all policy rules and the negation of safeInvariant to search for a violating state
  input.rules.forEach((rule, i) => {
    m.constraint(compileSmt(rule, bools, ints), `rule_${i}`);
  });
  m.constraint(not(compileSmt(input.safeInvariant, bools, ints)), "negated_invariant");

  const res = await m.check({ solver: "z3" });
  if (res.status !== "Sat") {
    return { hasViolation: false, counterexample: null };
  }

  // Extract counterexample state, rounding integer values and normalizing -0 to 0
  const counterexample: Record<string, boolean | number> = {};
  for (const name of input.boolVars) {
    counterexample[name] = Boolean(bools[name].value);
  }
  for (const spec of input.intVars) {
    counterexample[spec.name] = Math.round(ints[spec.name].value!) || 0;
  }

  return { hasViolation: true, counterexample };
}
