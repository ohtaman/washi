import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P062Input {
  demands: number[][];
  setupCosts: number[];
  holdCosts: number[];
  unitTimes: number[];
  setupTimes: number[];
  capacities: number[];
}

export interface P062Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export async function solve(input: P062Input): Promise<P062Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
