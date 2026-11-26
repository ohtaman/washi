import { Model, cumulative, expr, max, minimize } from "@ohtaman/washi";

export interface P074Input {
  durations: number[];
  demands: number[][];
  capacities: number[];
  precedences: number[][];
}

export interface P074Output {
  starts: number[];
  makespan: number;
}

export async function solve(input: P074Input): Promise<P074Output> {
  // TODO: Build and solve the RCPSP constraint programming model, then return the output.
  throw new Error("Not implemented");
}
