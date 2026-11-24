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

export interface TriggerRule {
  id: string;
  condition: PropFormula;
  effect: PropFormula;
}

export interface P045Input {
  vars: string[];
  baseRules: PropFormula[];
  rules: TriggerRule[];
}

export interface P045Output {
  deadRules: string[];
  redundantRules: string[];
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

// Helper: check satisfiability of a list of propositional formulas over Boolean variables `vars`
async function isSat(vars: string[], formulas: PropFormula[]): Promise<boolean> {
  const m = new Model("RuleAudit");
  const bools = m.bool(vars);
  formulas.forEach((f, i) => {
    m.constraint(compileFormula(f, bools), `f_${i}`);
  });
  const res = await m.check({ solver: "z3" });
  return res.status === "Sat";
}

export async function solve(input: P045Input): Promise<P045Output> {
  const deadRules: string[] = [];
  const redundantRules: string[] = [];
  // Accumulate base rules and prior trigger implications (condition => effect) in order
  const prior: PropFormula[] = [...input.baseRules];

  for (const r of input.rules) {
    // Dead rule: condition can never be satisfied under prior rules
    const canFire = await isSat(input.vars, [...prior, r.condition]);
    if (!canFire) {
      deadRules.push(r.id);
    } else {
      // Redundant rule: prior rules + condition already entail effect (negated effect is Unsat)
      const hasViol = await isSat(input.vars, [...prior, r.condition, { not: r.effect }]);
      if (!hasViol) {
        redundantRules.push(r.id);
      }
    }
    prior.push({ implies: [r.condition, r.effect] });
  }

  return {
    deadRules: deadRules.sort(),
    redundantRules: redundantRules.sort(),
  };
}
