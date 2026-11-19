import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P005Input {
  targetBatch: number;
  costs: number[];
  availabilities: number[];
  compositions: number[][];
  minRatios: number[];
  maxRatios: number[];
}

export interface P005Output {
  amounts: number[];
  totalCost: number;
}

export async function solve(input: P005Input): Promise<P005Output> {
  const m = new Model("AlloyBlending");

  // Decision variables: continuous amounts bounded by stock availabilities
  const amounts = input.availabilities.map((avail, i) =>
    m.continuous({ lb: 0, ub: avail, name: `amt_${i}` })
  );

  // TODO:
  // 1. Add total batch weight constraint: sum(amounts) == input.targetBatch
  // 2. For each element k, linearize min/max ratios using input.targetBatch
  // 3. Minimize dot(input.costs, amounts), solve, and return { amounts, totalCost }
  throw new Error("Not implemented");
}
