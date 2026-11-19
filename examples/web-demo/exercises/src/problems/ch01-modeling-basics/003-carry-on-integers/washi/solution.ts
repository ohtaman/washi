import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P003Input {
  maxWeight: number;
  weights: number[];
  values: number[];
  maxCounts: number[];
}

export interface P003Output {
  counts: number[];
  totalValue: number;
}

export async function solve(input: P003Input): Promise<P003Output> {
  const m = new Model("CarryOnBag");

  const counts = input.maxCounts.map((cap, i) =>
    m.integer(`item_${i}`, { lb: 0, ub: cap })
  );

  m.constraint(
    expr`dot(${input.weights}, ${counts}) <= ${input.maxWeight}`,
    "weight_limit"
  );

  m.objective(maximize(expr`dot(${input.values}, ${counts})`));
  await m.solve();

  return {
    counts: counts.map((v) => Math.round(v.value!)),
    totalValue: Math.round(m.objectiveValue!),
  };
}
