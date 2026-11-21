import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P079Input {
  durations: number[];
  priorities: number[];
  compatible: number[][];
  numSessions: number;
  regularCapacity: number;
  maxOvertime: number;
  overtimeCost: number;
}

export interface P079Output {
  assignedRoom: number[];
  assignedSession: number[];
  overtime: number[][];
  netScore: number;
}

export async function solve(input: P079Input): Promise<P079Output> {
  // TODO: Build and solve the operating room allocation model, then return the output.
  throw new Error("Not implemented");
}
