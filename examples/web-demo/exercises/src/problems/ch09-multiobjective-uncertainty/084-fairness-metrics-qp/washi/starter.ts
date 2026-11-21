import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P084Input {
  unitCosts: number[];
  minAlloc: number[];
  maxAlloc: number[];
  totalDemand: number;
  fairnessWeight: number;
}

export interface P084Output {
  allocations: number[];
  totalCost: number;
}

export async function solve(input: P084Input): Promise<P084Output> {
  // TODO: Build and solve the convex QP fairness model, then return the output.
  throw new Error("Not implemented");
}
