import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P004Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export async function solve(input: P004Input) {
  const nProducts = input.margins.length;
  const m = new Model("ProductMix");
  const quantities = m.continuous(nProducts, { lb: 0, prefix: "q" });

  // TODO:
  // 1. For each resource k in 0..input.capacities.length-1, add:
  //    dot(input.usages[k], quantities) <= input.capacities[k]
  // 2. Maximize dot(input.margins, quantities)
  // 3. Await m.solve() and return { quantities, totalProfit }
  throw new Error("Not implemented");
}
