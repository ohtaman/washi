import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P059Input {
  dist: number[][];
  demands: number[];
  vehicleCapacity: number;
  depotMaxVehicles: number[];
  depotCapacities: number[];
}

export interface P059Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P059Input): Promise<P059Output> {
  // TODO: Build and solve the multi-depot VRP MIP, then reconstruct and return the routes.
  throw new Error("Not implemented");
}
