import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface GroupRule {
  guests: number[];
  minCount: number;
}

export interface P014Input {
  budget: number;
  baseEnjoyment: number[];
  bonusRates: number[];
  minSpend: number[];
  maxSpend: number[];
  implications: number[][];
  conflicts: number[][];
  groupRules: GroupRule[];
}

export interface P014Output {
  invite: number[];
  giftBudget: number[];
  totalEnjoyment: number;
}

export async function solve(input: P014Input): Promise<P014Output> {
  const n = input.baseEnjoyment.length;
  const m = new Model("PartyInviteLogic");

  // Decision variables: binary invite[i] (whether guest i is invited) and continuous giftBudget[i] >= 0.
  const invite = m.binary(n, { prefix: "inv" });
  const giftBudget = m.continuous(n, { lb: 0, prefix: "gift" });

  // Semi-continuous gift spending: 0 if not invited, or in [minSpend[i], maxSpend[i]] if invited.
  m.constraint(
    giftBudget.map((g, i) => expr`${input.minSpend[i]} * ${invite[i]} <= ${g}`)
  );
  m.constraint(
    giftBudget.map((g, i) => expr`${g} <= ${input.maxSpend[i]} * ${invite[i]}`)
  );
  // Total gift spending limit.
  m.constraint(expr`${sum(giftBudget)} <= ${input.budget}`, "budget");
  // Logical implications (if guest a is invited, guest b must be invited) and conflicts (at most one of u, v).
  m.constraint(
    input.implications.map(([a, b]) => expr`${invite[a]} <= ${invite[b]}`)
  );
  m.constraint(
    input.conflicts.map(([u, v]) => expr`${invite[u]} + ${invite[v]} <= 1`)
  );
  // Group minimum attendance rules.
  m.constraint(
    input.groupRules.map(
      (rule) => expr`${sum(rule.guests.map((i) => invite[i]))} >= ${rule.minCount}`
    )
  );

  // Objective: maximize base enjoyment plus gift-weighted bonus enjoyment.
  m.objective(
    maximize(
      expr`dot(${input.baseEnjoyment}, ${invite}) + dot(${input.bonusRates}, ${giftBudget})`
    )
  );
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    invite: invite.map((v) => Math.round(v.value!) || 0),
    giftBudget: giftBudget.map((v) => v.value!),
    totalEnjoyment: m.objectiveValue!,
  };
}
