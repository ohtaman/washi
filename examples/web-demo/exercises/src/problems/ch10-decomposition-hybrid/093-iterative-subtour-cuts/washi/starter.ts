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
  const n = input.distances.length;
  const m = new Model("SymmetricTSP_DFJ");

  // Undirected edge variables x[i][j] for 0 <= i < j < n
  const edges = new Map<string, Var>();
  const edgeKey = (i: number, j: number) => (i < j ? `${i}_${j}` : `${j}_${i}`);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.set(edgeKey(i, j), m.binary(`x_${i}_${j}`));
    }
  }

  // TODO:
  // 1. Minimize total distance sum_{i < j} distances[i][j] * x_{ij}
  // 2. Add 2-matching degree constraints: for every city i, sum of incident edges == 2
  // 3. Iteratively solve m, trace connected components (cycles) in the integer solution:
  //    - If 1 component of size n, reconstruct tour starting at 0 and return { tour, totalDistance, iterations }
  //    - Otherwise, for each subtour component S, add DFJ cut:
  //      sum_{i, j in S, i < j} x_{ij} <= |S| - 1
  //      and re-solve
  throw new Error("Not implemented");
}
