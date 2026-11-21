import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P022Input {
  targets: number[];
  weights: number[];
  upperBounds: number[];
  costs: number[];
  budget: number;
  totalOutput: number;
}

export interface P022Output {
  allocations: number[];
  totalDeviation: number;
}

export async function solve(input: P022Input): Promise<P022Output> {
  const n = input.targets.length;
  const m = new Model("L1Deviation");

  // TODO: Build and solve the weighted L1 deviation LP, then return the output.
  throw new Error("Not implemented");
}
