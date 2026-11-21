import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P085Input {
  baseline: number[][];
  unavailable: number[][];
  demands: number[];
  maxShifts: number[];
  workerCosts: number[];
  disruptionWeight: number;
}

export interface P085Output {
  schedule: number[][];
  hammingDistance: number;
  totalObjective: number;
}

export async function solve(input: P085Input): Promise<P085Output> {
  // TODO: Build and solve the minimum-disruption rescheduling MIP, then return the output.
  throw new Error("Not implemented");
}
