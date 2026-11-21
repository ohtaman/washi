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

  // TODO: Ensure every task is covered exactly once, minimize total cost, and return the result.
  throw new Error("Not implemented");
}
