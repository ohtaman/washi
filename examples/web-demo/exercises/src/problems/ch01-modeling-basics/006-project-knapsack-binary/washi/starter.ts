import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P006Input {
  budget: number;
  costs: number[];
  values: number[];
}

export interface P006Output {
  selected: number[];
  totalValue: number;
}

export async function solve(input: P006Input): Promise<P006Output> {
  const n = input.costs.length;
  const m = new Model("ProjectSelection");
  const selected = m.binary(n, { prefix: "sel" });

  // TODO:
  // 1. Add budget constraint: dot(input.costs, selected) <= input.budget
  // 2. Maximize dot(input.values, selected)
  // 3. Await m.solve() and return { selected: selected.map((v) => Math.round(v.value!)), totalValue: m.objectiveValue! }
  throw new Error("Not implemented");
}
