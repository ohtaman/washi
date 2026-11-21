import { Model, Var, expr, maximize, minimize, solveColumnGeneration, sum } from "@ohtaman/washi";

export interface P095Input {
  demands: number[];
  shiftCosts: number[];
  baseCost: number;
  maxConsecutive: number;
  maxWorkDays: number;
}

export interface P095Output {
  selectedColumns: number[][];
  counts: number[];
  totalCost: number;
}

export async function solve(input: P095Input): Promise<P095Output> {
  // TODO: Solve the shift rostering problem via column generation and return the integer roster.
  throw new Error("Not implemented");
}
