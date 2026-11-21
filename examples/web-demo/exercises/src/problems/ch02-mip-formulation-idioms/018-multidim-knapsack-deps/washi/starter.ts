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

  // TODO: Enforce all resource capacities, prerequisites, and incompatibilities, maximize total value, and return the result.
  throw new Error("Not implemented");
}
