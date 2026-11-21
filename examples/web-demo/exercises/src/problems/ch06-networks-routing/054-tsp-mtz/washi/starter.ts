import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P054Input {
  dist: number[][];
}

export interface P054Output {
  tour: number[];
  totalCost: number;
}

export async function solve(input: P054Input): Promise<P054Output> {
  // TODO: Build and solve the asymmetric TSP MIP, then reconstruct and return the tour.
  throw new Error("Not implemented");
}
