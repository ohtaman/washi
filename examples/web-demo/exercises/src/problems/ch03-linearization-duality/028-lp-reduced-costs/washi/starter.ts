import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P028Input {
  costs: number[];
  yields: number[][];
  minRequirements: number[];
}

export interface P028Output {
  quantities: number[];
  reducedCosts: number[];
  optimalCost: number;
}

export async function solve(input: P028Input): Promise<P028Output> {
  const n = input.costs.length;
  const m = new Model("ReducedCosts");

  // TODO: Build and solve the production LP, then return quantities, reducedCosts, and optimalCost.
  throw new Error("Not implemented");
}
