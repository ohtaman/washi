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

  // TODO: Enforce budget and group cardinality rules, maximize total value, and return the result.
  throw new Error("Not implemented");
}
