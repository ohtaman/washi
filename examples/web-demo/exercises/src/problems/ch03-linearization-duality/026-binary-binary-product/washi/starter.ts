import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P026Input {
  values: number[];
  costs: number[];
  budget: number;
  pairs: number[][];
}

export interface P026Output {
  selected: number[];
  pairProducts: number[];
  totalValue: number;
}

export async function solve(input: P026Input): Promise<P026Output> {
  const n = input.values.length;
  const P = input.pairs.length;
  const m = new Model("BinaryBinaryProduct");

  const selected = m.binary(n, { prefix: "x" });
  const pairProducts = m.continuous(P, { lb: 0, ub: 1, prefix: "w" });

  // TODO:
  // 1. Add budget constraint: dot(input.costs, selected) <= input.budget
  // 2. For each pair [i, j, s] at index k, linearize w[k] = selected[i] * selected[j]:
  //    w[k] <= selected[i], w[k] <= selected[j], w[k] >= selected[i] + selected[j] - 1
  // 3. Maximize dot(input.values, selected) + dot(synergies, pairProducts), solve,
  //    and return { selected, pairProducts, totalValue }
  throw new Error("Not implemented");
}
