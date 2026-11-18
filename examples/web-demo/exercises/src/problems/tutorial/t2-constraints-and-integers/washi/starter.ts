import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface T2Input {
  maxWeight: number;
  weights: number[];
  values: number[];
  maxCounts: number[];
}

export async function solve(input: T2Input) {
  const m = new Model("CarryOnBag");

  // TODO 1: Switch `continuous` to `integer` so fractional items are forbidden!
  const counts = input.maxCounts.map((cap, i) =>
    m.continuous(`item_${i}`, { lb: 0, ub: cap })
  );

  // TODO 2: Add the weight limit constraint using dot(input.weights, counts) <= input.maxWeight

  m.objective(maximize(expr`dot(${input.values}, ${counts})`));
  await m.solve();

  return {
    counts: counts.map((v) => v.value!),
    totalValue: m.objectiveValue!,
  };
}
