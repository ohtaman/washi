import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P056Input {
  dist: number[][];
  demands: number[];
  capacity: number;
  maxVehicles: number;
}

export interface P056Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P056Input): Promise<P056Output> {
  // TODO: Build and solve the CVRP MIP, then reconstruct and return the routes.
  throw new Error("Not implemented");
}
