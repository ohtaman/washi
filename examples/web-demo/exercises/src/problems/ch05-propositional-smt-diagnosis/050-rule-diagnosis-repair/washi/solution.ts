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

// Check satisfiability of a subset of hard and soft rules identified by activeIds
async function checkRulesSubset(
  input: P050Input,
  activeIds: Set<string>
): Promise<{ res: CheckResult; assignment: Record<string, boolean | number> }> {
  const m = new Model("PolicyCheck");
  const bools = m.bool(input.boolVars);
  const ints: Record<string, Var> = {};
  for (const spec of input.intVars) {
    ints[spec.name] = m.integer(spec.name, { lb: spec.lb, ub: spec.ub });
  }
  for (const h of input.hardRules) {
    if (activeIds.has(h.id)) m.constraint(compileSmt(h.expr, bools, ints), h.id);
  }
  for (const s of input.softRules) {
    if (activeIds.has(s.id)) m.constraint(compileSmt(s.expr, bools, ints), s.id);
  }
  const res = await m.check({ solver: "z3" });
  const assignment: Record<string, boolean | number> = {};
  if (res.status === "Sat") {
    for (const name of input.boolVars) assignment[name] = Boolean(bools[name].value);
    for (const spec of input.intVars) assignment[spec.name] = Math.round(ints[spec.name].value!) || 0;
  }
  return { res, assignment };
}

export async function solve(input: P050Input): Promise<P050Output> {
  // Phase 1: Check full rule set consistency
  const allIds = [...input.hardRules.map((h) => h.id), ...input.softRules.map((s) => s.id)];
  const initial = await checkRulesSubset(input, new Set(allIds));

  if (initial.res.status === "Sat") {
    return {
      consistent: true,
      minimalCore: [],
      relaxedRules: [],
      repairCost: 0,
      repairedAssignment: initial.assignment,
    };
  }

  // Phase 2: Deletion-based MUS extraction starting from Z3's initial unsatCore
  let core = Array.from(new Set(initial.res.unsatCore ?? allIds));
  for (const ruleId of [...core]) {
    if (!core.includes(ruleId)) continue;
    const candidate = core.filter((id) => id !== ruleId);
    const sub = await checkRulesSubset(input, new Set(candidate));
    if (sub.res.status === "Unsat") {
      if (sub.res.unsatCore && sub.res.unsatCore.length > 0) {
        const subSet = new Set(sub.res.unsatCore);
        core = candidate.filter((id) => subSet.has(id));
      } else {
        core = candidate;
      }
    }
  }

  // Phase 3: Weighted MaxSMT repair — keep hard rules strict and minimize weighted soft-rule violations
  const optModel = new Model("PolicyRepair");
  const bools = optModel.bool(input.boolVars);
  const ints: Record<string, Var> = {};
  for (const spec of input.intVars) {
    ints[spec.name] = optModel.integer(spec.name, { lb: spec.lb, ub: spec.ub });
  }
  for (const h of input.hardRules) {
    optModel.constraint(compileSmt(h.expr, bools, ints), h.id);
  }
  // violated[k] in {0, 1}: 1 iff soft rule k is relaxed/violated
  const violated = optModel.binary(input.softRules.length, { prefix: "viol" });
  const weights = input.softRules.map((s) => s.weight);
  input.softRules.forEach((s, k) => {
    const cond = compileSmt(s.expr, bools, ints);
    optModel.constraint(or(cond, expr`${violated[k]} == 1`), `relax_${s.id}`);
    optModel.constraint(implies(cond, expr`${violated[k]} == 0`), `tight_${s.id}`);
  });
  if (violated.length > 0) {
    optModel.objective(minimize(dot(weights, violated)));
  }

  await optModel.solve({ solver: "z3" });

  // Extract repaired assignment (rounding integers and normalizing -0 to 0) and violated soft rules
  const repairedAssignment: Record<string, boolean | number> = {};
  for (const name of input.boolVars) {
    repairedAssignment[name] = Boolean(bools[name].value);
  }
  for (const spec of input.intVars) {
    repairedAssignment[spec.name] = Math.round(ints[spec.name].value!) || 0;
  }

  const relaxedRules = input.softRules
    .filter((_, k) => Math.round(violated[k].value!) === 1)
    .map((s) => s.id)
    .sort();
  const repairCost = input.softRules.reduce(
    (acc, s, k) => acc + (Math.round(violated[k].value!) === 1 ? s.weight : 0),
    0
  );

  return {
    consistent: false,
    minimalCore: core.sort(),
    relaxedRules,
    repairCost,
    repairedAssignment,
  };
}
