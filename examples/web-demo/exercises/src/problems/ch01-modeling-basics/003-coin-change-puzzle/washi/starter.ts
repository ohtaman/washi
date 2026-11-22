import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P003Input {
  denominations: number[];
  maxCounts: number[];
  targetAmount: number;
}

export interface P003Output {
  counts: number[];
  totalCoins: number;
}

export async function solve(input: P003Input): Promise<P003Output> {
  const m = new Model("CoinChange");

  // TODO 1: Switch `continuous` to `integer` and enforce `ub: cap` from input.maxCounts
  const counts = input.denominations.map((_, i) =>
    m.continuous(`coin_${i}`, { lb: 0 })
  );

  // TODO 2: Add the exact target amount constraint using dot(input.denominations, counts) == input.targetAmount

  m.objective(minimize(expr`sum(${counts})`));
  await m.solve();

  return {
    counts: counts.map((v) => v.value!),
    totalCoins: m.objectiveValue!,
  };
}
