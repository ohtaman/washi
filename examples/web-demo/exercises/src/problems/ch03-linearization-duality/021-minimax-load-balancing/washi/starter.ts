import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P021Input {
  weights: number[];
  compatible: number[][];
}

export interface P021Output {
  assignments: number[][];
  peakLoad: number;
}

export async function solve(input: P021Input): Promise<P021Output> {
  const m = new Model("MinimaxLoadBalancing");

  const assignments = input.compatible.map((row, i) =>
    row.map((allowed, j) => m.continuous(`x_${i}_${j}`, { lb: 0, ub: allowed }))
  );
  const peak = m.continuous("peak", { lb: 0 });

  // TODO:
  // 1. Ensure each job i is fully split across servers: sum(assignments[i]) == 1
  // 2. Introduce minimax epigraph constraints for each server j:
  //    sum_i (weights[i] * assignments[i][j]) <= peak
  // 3. Minimize peak, solve, and return { assignments, peakLoad }
  throw new Error("Not implemented");
}
