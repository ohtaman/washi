import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P007Input {
  costs: number[][];
}

export interface P007Output {
  assignment: number[];
  totalCost: number;
}

export async function solve(input: P007Input): Promise<P007Output> {
  const n = input.costs.length;
  const m = new Model("TaskAssignment");

  const x = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => m.binary(`x_${i}_${j}`))
  );

  // TODO:
  // 1. Enforce sum of each row x[i] == 1 and sum of each column j == 1
  // 2. Minimize total sum_{i, j} input.costs[i][j] * x[i][j]
  // 3. Await m.solve(), extract assignment[i] = column j with x[i][j] == 1, and return { assignment, totalCost }
  throw new Error("Not implemented");
}
