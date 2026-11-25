import { Model, disjoint, expr, max, minimize } from "@ohtaman/washi";

export interface P073Input {
  machines: number[][];
  durations: number[][];
}

export interface P073Output {
  starts: number[][];
  makespan: number;
}

export async function solve(input: P073Input): Promise<P073Output> {
  // TODO: Build and solve the job-shop scheduling CP model, then return the output.
  throw new Error("Not implemented");
}
