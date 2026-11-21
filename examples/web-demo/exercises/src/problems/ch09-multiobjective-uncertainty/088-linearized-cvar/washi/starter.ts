import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P088Input {
  returns: number[][];
  probs: number[];
  alpha: number;
  riskWeight: number;
  maxWeight: number;
}

export interface P088Output {
  weights: number[];
  varThreshold: number;
  cvar: number;
  totalObjective: number;
}

export async function solve(input: P088Input): Promise<P088Output> {
  // TODO: Build and solve the linearized CVaR portfolio LP, then return the output.
  throw new Error("Not implemented");
}
