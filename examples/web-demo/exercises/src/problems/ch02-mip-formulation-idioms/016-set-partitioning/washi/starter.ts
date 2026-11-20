import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P016Input {
  numTasks: number;
  costs: number[];
  routes: number[][];
}

export interface P016Output {
  selected: number[];
  totalCost: number;
}

export async function solve(input: P016Input): Promise<P016Output> {
  const mCount = input.costs.length;
  const m = new Model("SetPartitioning");
  const selected = m.binary(mCount, { prefix: "route" });

  // TODO:
  // 1. For each task i in 0..input.numTasks-1, require sum_{j : i in routes[j]} selected[j] == 1
  // 2. Minimize dot(input.costs, selected), solve, and return { selected, totalCost }
  throw new Error("Not implemented");
}
