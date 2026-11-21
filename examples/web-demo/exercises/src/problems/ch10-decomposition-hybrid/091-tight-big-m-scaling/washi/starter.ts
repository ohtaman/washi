import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P091Input {
  fixedCosts: number[];
  unitCosts: number[];
  capacities: number[];
  demand: number;
}

export interface P091Output {
  open: number[];
  quantities: number[];
  totalCost: number;
  lpBound: number;
}

export async function solve(input: P091Input): Promise<P091Output> {
  // TODO: Build and solve the tight Big-M MIP and its LP relaxation, then return the output.
  throw new Error("Not implemented");
}
