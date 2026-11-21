import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P064Input {
  externalDemands: number[][];
  bom: number[][];
  leadTimes: number[];
  initialInventory: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCosts: number[];
  capacities: number[];
}

export interface P064Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export async function solve(input: P064Input): Promise<P064Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
