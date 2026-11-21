import { Model, Var, expr, maximize, minimize, solveColumnGeneration } from "@ohtaman/washi";

export interface P094Input {
  rollWidth: number;
  widths: number[];
  demands: number[];
}

export interface P094Output {
  patterns: number[][];
  counts: number[];
  totalRolls: number;
}

export async function solve(input: P094Input): Promise<P094Output> {
  // TODO: Solve the 1D cutting stock problem via column generation and return the integer plan.
  throw new Error("Not implemented");
}
