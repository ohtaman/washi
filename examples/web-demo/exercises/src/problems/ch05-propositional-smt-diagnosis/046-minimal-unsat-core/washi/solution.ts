import {
  Model,
  and,
  expr,
  implies,
  not,
  or,
  xor,
  type BoolVar,
  type CheckResult,
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

async function checkSubset(input: P046Input, activeIds: string[]): Promise<CheckResult> {
  const m = new Model("MusCheck");
  const bools = m.bool(input.boolVars);
  const ints: Record<string, Var> = {};
  for (const spec of input.intVars) {
    ints[spec.name] = m.integer(spec.name, { lb: spec.lb, ub: spec.ub });
  }
  const activeSet = new Set(activeIds);
  for (const r of input.rules) {
    if (activeSet.has(r.id)) {
      m.constraint(compileSmt(r.expr, bools, ints), r.id);
    }
  }
  return m.check({ solver: "z3" });
}

export async function solve(input: P046Input): Promise<P046Output> {
  const allIds = input.rules.map((r) => r.id);
  const initial = await checkSubset(input, allIds);
  let core = Array.from(new Set(initial.unsatCore ?? allIds));

  for (const ruleId of [...core]) {
    if (!core.includes(ruleId)) continue;
    const candidate = core.filter((id) => id !== ruleId);
    const res = await checkSubset(input, candidate);
    if (res.status === "Unsat") {
      if (res.unsatCore && res.unsatCore.length > 0) {
        const subSet = new Set(res.unsatCore);
        core = candidate.filter((id) => subSet.has(id));
      } else {
        core = candidate;
      }
    }
  }

  return { coreRules: core.sort() };
}
