import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P071Input {
  releaseDates: number[];
  processingTimes: number[];
  dueDates: number[];
  weights: number[];
}

export interface P071Output {
  starts: number[];
  totalWeightedTardiness: number;
}

export async function solve(input: P071Input): Promise<P071Output> {
  // TODO: Build and solve the single-machine weighted tardiness model, then return the output.
  throw new Error("Not implemented");
}
