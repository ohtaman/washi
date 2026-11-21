import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P063Input {
  demands: number[];
  capacities: number[];
  prodCosts: number[];
  unitPrice: number;
  holdCost: number;
  backorderCost: number;
  lostSalePenalty: number;
  initialInventory: number;
}

export interface P063Output {
  production: number[];
  sales: number[];
  inventory: number[];
  backlog: number[];
  lostSales: number[];
  netProfit: number;
}

export async function solve(input: P063Input): Promise<P063Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
