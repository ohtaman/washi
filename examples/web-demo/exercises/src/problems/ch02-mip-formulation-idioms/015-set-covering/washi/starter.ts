import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P015Input {
  numElements: number;
  costs: number[];
  sets: number[][];
}

export interface P015Output {
  selected: number[];
  totalCost: number;
}

export async function solve(input: P015Input): Promise<P015Output> {
  const mCount = input.costs.length;
  const m = new Model("SetCovering");
  const selected = m.binary(mCount, { prefix: "set" });

  // TODO:
  // 1. For each element i in 0..input.numElements-1, enforce sum_{j : i in sets[j]} selected[j] >= 1
  // 2. Minimize dot(input.costs, selected), solve, and return { selected, totalCost }
  throw new Error("Not implemented");
}
