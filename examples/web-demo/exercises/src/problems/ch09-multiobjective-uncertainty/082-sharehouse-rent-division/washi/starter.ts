import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P082Input {
  valuations: number[][];
  totalRent: number;
}

export interface P082Output {
  assignment: number[];
  rents: number[];
  totalValuation: number;
  minSurplus: number;
}

export async function solve(input: P082Input): Promise<P082Output> {
  // TODO: Solve the two-stage room assignment and fair rent division problem.
  throw new Error("Not implemented");
}
