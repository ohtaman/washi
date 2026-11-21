import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P027Input {
  costs: number[];
  capacities: number[];
  yields: number[][];
  minRequirements: number[];
  resourceUsages: number[][];
  maxResources: number[];
}

export interface P027Output {
  quantities: number[];
  duals: number[];
  optimalCost: number;
}

export async function solve(input: P027Input): Promise<P027Output> {
  const m = new Model("ShadowPrices");

  // TODO: Build and solve the dispatch LP, then return quantities, shadow duals, and optimalCost.
  throw new Error("Not implemented");
}
