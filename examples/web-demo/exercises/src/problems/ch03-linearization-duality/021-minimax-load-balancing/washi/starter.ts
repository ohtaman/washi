import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P021Input {
  weights: number[];
  compatible: number[][];
}

export interface P021Output {
  assignments: number[][];
  peakLoad: number;
}

export async function solve(input: P021Input): Promise<P021Output> {
  const m = new Model("MinimaxLoadBalancing");

  // TODO: Declare variables, enforce job assignments and server peak bounds, and minimize peak load.
  throw new Error("Not implemented");
}
