import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P029Input {
  demand: number;
  bandLbs: number[][];
  bandUbs: number[][];
  fixedCosts: number[][];
  unitCosts: number[][];
}

export interface P029Output {
  modes: number[];
  outputs: number[];
  totalCost: number;
}

export async function solve(input: P029Input): Promise<P029Output> {
  const m = new Model("DisjunctiveConvexHull");

  // TODO: Build and solve the piecewise operating-band MIP, then return the output.
  throw new Error("Not implemented");
}
