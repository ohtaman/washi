import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P009Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export async function solve(input: P009Input) {
  const m = new Model("ShadowPrices");

  // TODO: Declare quantities >= 0, keep constraint references c = m.constraint(...),
  // solve the maximization LP, read c.dual and c.slack,
  // and return { quantities, optimalProfit, shadowPrices, slacks, isBottleneck }.
  throw new Error("Not implemented");
}
