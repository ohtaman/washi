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
  const T = input.demands.length;

  // TODO:
  // 1. Start from fixedSetups = [...input.initialPlan].
  // 2. Implement a Fix-and-Optimize rolling window loop:
  //    For overlapping windows [start, start + input.windowSize):
  //    - Build a sub-MIP where y[t] is Binary inside [start, end) and fixed to fixedSetups[t] outside.
  //    - Keep continuous production p[t] and inventory inv[t] free across all periods so flow balances cleanly.
  //    - Solve with HiGHS and adopt improved setup decisions whenever totalCost strictly decreases.
  // 3. Repeat full sweeps until a complete pass yields no further improvement and return
  //    { setups, production, inventory, totalCost }.
  throw new Error("Not implemented");
}
