import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P089Input {
  profits: number[];
  nominalUsages: number[];
  deviations: number[];
  maxUnits: number[];
  capacityCap: number;
  gamma: number;
}

export interface P089Output {
  quantities: number[];
  totalProfit: number;
}

export async function solve(input: P089Input): Promise<P089Output> {
  // TODO: Build and solve the Bertsimas-Sim robust LP, then return the output.
  throw new Error("Not implemented");
}
