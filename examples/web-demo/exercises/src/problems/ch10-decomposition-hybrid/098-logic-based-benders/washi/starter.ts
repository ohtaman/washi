import { Model, BendersCut, Var, disjoint, expr, minimize, sum } from "@ohtaman/washi";

export interface P098Input {
  costs: number[][];
  durations: number[];
  releaseTimes: number[];
  deadlines: number[];
  horizon: number;
}

export interface P098Output {
  assignments: number[];
  starts: number[];
  totalCost: number;
}

export async function solve(input: P098Input): Promise<P098Output> {
  // TODO: Solve the assignment and scheduling problem using Logic-Based Benders Decomposition.
  throw new Error("Not implemented");
}
