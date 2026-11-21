import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P081Input {
  unitCosts: number[];
  hours: number[];
  targets: number[];
  shortfallPenalties: number[];
  excessPenalties: number[];
  machineCap: number;
  minTotal: number;
}

export interface P081Output {
  quantities: number[];
  shortfalls: number[];
  excesses: number[];
  totalCost: number;
}

export async function solve(input: P081Input): Promise<P081Output> {
  // TODO: Build and solve the elastic LP model, then return the output.
  throw new Error("Not implemented");
}
