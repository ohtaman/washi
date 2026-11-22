import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P057Input {
  travelTimes: number[][];
  earliest: number[];
  latest: number[];
  visitDurations: number[];
  maxGroups: number;
}

export interface P057Output {
  itineraries: number[][];
  totalCost: number;
}

export async function solve(input: P057Input): Promise<P057Output> {
  // TODO: Build and solve the theme park itinerary MIP, then reconstruct and return the itineraries.
  throw new Error("Not implemented");
}
