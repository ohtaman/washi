import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P057Input {
  dist: number[][];
  earliest: number[];
  latest: number[];
  service: number[];
  maxVehicles: number;
}

export interface P057Output {
  routes: number[][];
  totalCost: number;
}

export async function solve(input: P057Input): Promise<P057Output> {
  // TODO: Build and solve the VRPTW MIP, then reconstruct and return the routes.
  throw new Error("Not implemented");
}
