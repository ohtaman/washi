import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P075Input {
  demands: number[][];
  shiftCosts: number[][];
  minShifts: number[];
  maxShifts: number[];
  daysOff: number[][];
}

export interface P075Output {
  schedule: number[][];
  totalCost: number;
}

export async function solve(input: P075Input): Promise<P075Output> {
  // TODO: Build and solve the staff shift coverage model, then return the output.
  throw new Error("Not implemented");
}
