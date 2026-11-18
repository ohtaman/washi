import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P001Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export async function solve(input: P001Input) {
  const m = new Model("IceCreamMix");

  // TODO: Declare continuous non-negative decision variables, add resource capacity constraints,
  // maximize dot(input.margins, quantities), solve, and return { quantities, totalProfit }.
  throw new Error("Not implemented");
}
