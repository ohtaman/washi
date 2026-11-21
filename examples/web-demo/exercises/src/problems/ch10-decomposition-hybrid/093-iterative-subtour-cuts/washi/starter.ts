import { Model, Var, expr, minimize, sum } from "@ohtaman/washi";

export interface P093Input {
  distances: number[][];
}

export interface P093Output {
  tour: number[];
  totalDistance: number;
  iterations: number;
}

export async function solve(input: P093Input): Promise<P093Output> {
  // TODO: Solve the symmetric TSP with iterative DFJ subtour elimination cuts, then return the tour.
  throw new Error("Not implemented");
}
