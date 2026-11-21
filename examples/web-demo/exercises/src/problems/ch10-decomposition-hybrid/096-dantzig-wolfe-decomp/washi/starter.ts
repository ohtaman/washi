import { Model, ColumnProposal, expr, maximize, solveColumnGeneration } from "@ohtaman/washi";

export interface P096Input {
  profits: number[][];
  localUsages: number[][];
  localCaps: number[];
  sharedUsages: number[][];
  sharedCap: number;
  productCaps: number[][];
}

export interface P096Output {
  allocations: number[][];
  totalProfit: number;
}

export async function solve(input: P096Input): Promise<P096Output> {
  // TODO: Solve the block-angular LP using Dantzig-Wolfe decomposition via column generation.
  throw new Error("Not implemented");
}
