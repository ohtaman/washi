import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P090Input {
  fixedCosts: number[];
  capacities: number[];
  dropAmounts: number[];
  gamma: number;
  robustMinCap: number;
  probs: number[];
  demands: number[];
  offline: number[][];
  disruptionCost: number;
  shortfallPenalty: number;
}

export interface P090Output {
  committed: number[];
  recovered: number[][];
  totalCost: number;
}

export async function solve(input: P090Input): Promise<P090Output> {
  // TODO: Build and solve the resilient planning and recovery MIP, then return the output.
  throw new Error("Not implemented");
}
