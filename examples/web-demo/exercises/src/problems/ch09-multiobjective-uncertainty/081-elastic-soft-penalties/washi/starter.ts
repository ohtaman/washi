import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P081Input {
  unitCosts: number[];
  hours: number[];
  targets: number[];
  shortfallPenalties: number[];
  excessPenalties: number[];
  machineCap: number;
  minTotal: number;
}

export interface P081Output {
  quantities: number[];
  shortfalls: number[];
  excesses: number[];
  totalCost: number;
}

export async function solve(input: P081Input): Promise<P081Output> {
  const n = input.unitCosts.length;
  const m = new Model("ElasticSoftPenalties");

  const quantities = m.continuous(n, { lb: 0, prefix: "q" });
  const shortfalls = m.continuous(n, { lb: 0, prefix: "s_neg" });
  const excesses = m.continuous(n, { lb: 0, prefix: "s_pos" });

  // TODO:
  // 1. Add elastic target equations: quantities[j] + shortfalls[j] - excesses[j] == targets[j]
  // 2. Add hard machine capacity dot(hours, quantities) <= machineCap and sum(quantities) >= minTotal
  // 3. Minimize dot(unitCosts, quantities) + dot(shortfallPenalties, shortfalls) + dot(excessPenalties, excesses)
  // 4. Solve and return { quantities, shortfalls, excesses, totalCost }
  throw new Error("Not implemented");
}
