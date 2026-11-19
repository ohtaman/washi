import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P010Input {
  margins: number[];
  fixedCosts: number[];
  capacities: number[];
  materialUsages: number[];
  materialCap: number;
}

export async function solve(input: P010Input) {
  const n = input.margins.length;
  const m = new Model("LineActivation");

  const open = m.binary(n, { prefix: "open" });
  const quantities = m.continuous(n, { lb: 0, prefix: "qty" });

  // TODO:
  // 1. Link capacity to line activation for each i: quantities[i] - capacities[i] * open[i] <= 0
  // 2. Add shared raw material constraint: dot(input.materialUsages, quantities) <= input.materialCap
  // 3. Maximize net profit dot(input.margins, quantities) - dot(input.fixedCosts, open), solve,
  //    and return { open: open.map((v) => Math.round(v.value!)), quantities: quantities.map((v) => v.value!), netProfit: m.objectiveValue! }
  throw new Error("Not implemented");
}
