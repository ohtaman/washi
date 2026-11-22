import { Model, at, distinct, expr, minimize, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P031Input {
  costMatrix: number[][];
}

export interface P031Output {
  cols: number[];
  totalCost: number;
}

export async function solve(input: P031Input): Promise<P031Output> {
  const n = input.costMatrix.length;
  const m = new Model("WeightedNQueens");

  // TODO: Model the queen column positions, non-attacking constraints, and board cost objective.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
