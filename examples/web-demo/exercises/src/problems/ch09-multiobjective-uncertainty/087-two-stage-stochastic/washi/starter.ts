import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P087Input {
  orderCosts: number[];
  shortageCosts: number[];
  salvageValues: number[];
  warehouseCap: number;
  probs: number[];
  demands: number[][];
}

export interface P087Output {
  orders: number[];
  expectedCost: number;
}

export async function solve(input: P087Input): Promise<P087Output> {
  // TODO: Build and solve the two-stage stochastic LP, then return the output.
  throw new Error("Not implemented");
}
