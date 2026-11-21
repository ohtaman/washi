import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P076Input {
  demands: number[][];
  shiftCosts: number[][];
  maxConsecutiveDays: number;
}

export interface P076Output {
  schedule: number[][];
  totalCost: number;
}

export async function solve(input: P076Input): Promise<P076Output> {
  // TODO: Build and solve the consecutive workday and rest rostering model, then return the output.
  throw new Error("Not implemented");
}
