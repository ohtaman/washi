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

  // TODO: Link conditional gift ranges, enforce budget and guest rules, maximize total enjoyment, and return the result.
  throw new Error("Not implemented");
}
