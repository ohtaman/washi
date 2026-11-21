import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P060Input {
  numTerritories: number;
  demands: number[];
  demandBounds: number[];
  hubCosts: number[];
  adjEdges: number[][];
  dist: number[][];
}

export interface P060Territory {
  hub: number;
  tour: number[];
}

export interface P060Output {
  territories: P060Territory[];
  totalCost: number;
}

export async function solve(input: P060Input): Promise<P060Output> {
  // TODO: Build and solve the connected territory design and hub routing MIP, then return the output.
  throw new Error("Not implemented");
}
