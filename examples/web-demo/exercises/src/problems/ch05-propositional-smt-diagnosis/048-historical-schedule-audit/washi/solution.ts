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

export interface AuditRule {
  id: string;
  expr: SmtFormula;
}

export interface P048Input {
  boolVars: string[];
  intVars: Array<{ name: string; lb: number; ub: number }>;
  rules: AuditRule[];
  candidateValues: Record<string, boolean | number>;
}

export interface P048Output {
  valid: boolean;
  violatedRules: string[];
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

export async function solve(input: P048Input): Promise<P048Output> {
  const m = new Model("HistoricalAudit");
  // Declare Boolean and bounded integer variables matching the audited state schema
  const bools = m.bool(input.boolVars);
  const ints: Record<string, Var> = {};
  for (const spec of input.intVars) {
    ints[spec.name] = m.integer(spec.name, { lb: spec.lb, ub: spec.ub });
  }

  // Register each named audit rule so violations can be attributed by rule ID
  for (const r of input.rules) {
    m.constraint(compileSmt(r.expr, bools, ints), r.id);
  }

  // Evaluate candidateValues directly against all constraints without invoking the solver
  const report = m.verify({ values: input.candidateValues });
  const violatedRules = Array.from(new Set(report.violations.map((v) => v.name))).sort();

  return {
    valid: report.valid,
    violatedRules,
  };
}
