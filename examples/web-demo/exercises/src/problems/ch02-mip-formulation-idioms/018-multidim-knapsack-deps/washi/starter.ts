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

  // TODO:
  // 1. Add capacity constraint for each resource k: dot(input.weights[k], selected) <= input.capacities[k]
  // 2. Add prerequisites (selected[a] <= selected[b]) and incompatibles (selected[c] + selected[d] <= 1)
  // 3. Maximize dot(input.values, selected), solve, and return { selected, totalValue }
  throw new Error("Not implemented");
}
