import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P092Input {
  weights: number[];
  binCapacity: number;
}

export interface P092Output {
  assignments: number[];
  binsUsed: number;
  lpBound: number;
}

export async function solve(input: P092Input): Promise<P092Output> {
  // TODO: Build and solve the symmetry-broken, cut-strengthened bin packing MIP and its LP relaxation.
  throw new Error("Not implemented");
}
