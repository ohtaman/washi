import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P013ExactGroup {
  indices: number[];
  count: number;
}

export interface P013Input {
  budget: number;
  costs: number[];
  values: number[];
  mutexGroups: number[][];
  exactGroups: P013ExactGroup[];
  atLeastOneGroups: number[][];
}

export interface P013Output {
  selected: number[];
  totalValue: number;
}

export async function solve(input: P013Input): Promise<P013Output> {
  const n = input.costs.length;
  const m = new Model("CardinalitySelection");
  const selected = m.binary(n, { prefix: "sel" });

  // TODO:
  // 1. Add budget constraint: dot(input.costs, selected) <= input.budget
  // 2. Enforce mutexGroups (sum <= 1), exactGroups (sum == count), and atLeastOneGroups (sum >= 1)
  // 3. Maximize dot(input.values, selected), solve, and return { selected, totalValue }
  throw new Error("Not implemented");
}
