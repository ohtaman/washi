import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P018Input {
  values: number[];
  weights: number[][];
  capacities: number[];
  prerequisites: number[][];
  incompatibles: number[][];
}

export interface P018Output {
  selected: number[];
  totalValue: number;
}

export async function solve(input: P018Input): Promise<P018Output> {
  const n = input.values.length;
  const m = new Model("MultidimKnapsackDeps");
  const selected = m.binary(n, { prefix: "item" });

  m.constraint(
    input.capacities.map((cap, k) => expr`dot(${input.weights[k]}, ${selected}) <= ${cap}`)
  );
  m.constraint(
    input.prerequisites.map(([a, b]) => expr`${selected[a]} <= ${selected[b]}`)
  );
  m.constraint(
    input.incompatibles.map(([c, d]) => expr`${selected[c]} + ${selected[d]} <= 1`)
  );

  m.objective(maximize(expr`dot(${input.values}, ${selected})`));
  await m.solve();

  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    totalValue: m.objectiveValue!,
  };
}
