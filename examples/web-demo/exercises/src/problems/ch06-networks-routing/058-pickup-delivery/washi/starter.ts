import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P058Request {
  pickup: number;
  delivery: number;
  demand: number;
}

export interface P058Input {
  dist: number[][];
  requests: P058Request[];
  capacity: number;
  maxVehicles: number;
  maxStopsPerVehicle: number;
}

export interface P058Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P058Input): Promise<P058Output> {
  // TODO: Build and solve the pickup-and-delivery MIP, then reconstruct and return the routes.
  throw new Error("Not implemented");
}
