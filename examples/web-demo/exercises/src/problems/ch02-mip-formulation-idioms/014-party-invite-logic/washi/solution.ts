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

  const invite = m.binary(n, { prefix: "inv" });
  const giftBudget = m.continuous(n, { lb: 0, prefix: "gift" });

  m.constraint(
    giftBudget.map((g, i) => expr`${input.minSpend[i]} * ${invite[i]} <= ${g}`)
  );
  m.constraint(
    giftBudget.map((g, i) => expr`${g} <= ${input.maxSpend[i]} * ${invite[i]}`)
  );
  m.constraint(expr`${sum(giftBudget)} <= ${input.budget}`, "budget");
  m.constraint(
    input.implications.map(([a, b]) => expr`${invite[a]} <= ${invite[b]}`)
  );
  m.constraint(
    input.conflicts.map(([u, v]) => expr`${invite[u]} + ${invite[v]} <= 1`)
  );
  m.constraint(
    input.groupRules.map(
      (rule) => expr`${sum(rule.guests.map((i) => invite[i]))} >= ${rule.minCount}`
    )
  );

  m.objective(
    maximize(
      expr`dot(${input.baseEnjoyment}, ${invite}) + dot(${input.bonusRates}, ${giftBudget})`
    )
  );
  await m.solve();

  return {
    invite: invite.map((v) => Math.round(v.value!) || 0),
    giftBudget: giftBudget.map((v) => v.value!),
    totalEnjoyment: m.objectiveValue!,
  };
}
