import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P079Input {
  durations: number[];
  scores: number[];
  compatible: number[][];
  numSlots: number;
  regularLength: number;
  maxOvertime: number;
  overtimeCost: number;
}

export interface P079Output {
  assignedVenue: number[];
  assignedSlot: number[];
  overtime: number[][];
  netScore: number;
}

export async function solve(input: P079Input): Promise<P079Output> {
  // TODO: Build and solve the e-sports venue scheduling model, then return the output.
  throw new Error("Not implemented");
}
