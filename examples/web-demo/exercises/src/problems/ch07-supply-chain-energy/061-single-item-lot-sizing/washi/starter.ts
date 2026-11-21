import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P061Input {
  demands: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCosts: number[];
  capacities: number[];
}

export interface P061Output {
  setups: number[];
  production: number[];
  inventory: number[];
  totalCost: number;
}

export async function solve(input: P061Input): Promise<P061Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
