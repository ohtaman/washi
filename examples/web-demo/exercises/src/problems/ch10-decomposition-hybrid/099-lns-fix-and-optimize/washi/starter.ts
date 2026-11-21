import { Model, Var, expr, minimize } from "@ohtaman/washi";

export interface P099Input {
  demands: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCost: number;
  capacities: number[];
  initialPlan: number[];
  windowSize: number;
}

export interface P099Output {
  setups: number[];
  production: number[];
  inventory: number[];
  totalCost: number;
}

export async function solve(input: P099Input): Promise<P099Output> {
  // TODO: Improve the initial lot-sizing plan via Fix-and-Optimize LNS and return the schedule.
  throw new Error("Not implemented");
}
