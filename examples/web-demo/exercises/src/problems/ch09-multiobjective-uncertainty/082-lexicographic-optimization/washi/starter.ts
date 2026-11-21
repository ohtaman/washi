import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P082Input {
  coverage: number[];
  crews: number[];
  opCosts: number[];
  maxCrews: number;
  targetDemand: number;
  slack: number;
}

export interface P082Output {
  selected: number[];
  obj1: number;
  obj2: number;
}

export async function solve(input: P082Input): Promise<P082Output> {
  // TODO: Solve the two-stage lexicographic MIP and return the output.
  throw new Error("Not implemented");
}
