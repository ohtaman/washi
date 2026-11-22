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

  const counts = input.maxCounts.map((cap, i) =>
    m.integer(`coin_${i}`, { lb: 0, ub: cap })
  );

  m.constraint(
    expr`dot(${input.denominations}, ${counts}) == ${input.targetAmount}`,
    "exact_target"
  );

  m.objective(minimize(expr`sum(${counts})`));
  await m.solve();

  return {
    counts: counts.map((v) => Math.round(v.value!) || 0),
    totalCoins: Math.round(m.objectiveValue!) || 0,
  };
}
