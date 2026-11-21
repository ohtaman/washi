import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P072Input {
  processingTimes: number[];
  setupMatrix: number[][];
  dueDates: number[];
}

export interface P072Output {
  order: number[];
  completions: number[];
  totalTardiness: number;
}

export async function solve(input: P072Input): Promise<P072Output> {
  // TODO: Build and solve the sequence-dependent setup scheduling model, then return the output.
  throw new Error("Not implemented");
}
