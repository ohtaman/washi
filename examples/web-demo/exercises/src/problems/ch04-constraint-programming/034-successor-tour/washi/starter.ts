import { Model, at, distinct, expr, implies, minimize, sum } from "@ohtaman/washi";

export interface P034Input {
  distances: number[][];
}

export interface P034Output {
  next: number[];
  totalDistance: number;
}

export async function solve(input: P034Input): Promise<P034Output> {
  const n = input.distances.length;
  const m = new Model("SuccessorTour");

  // TODO: Model the successor tour, subtour elimination, and total distance objective.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
