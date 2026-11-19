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

  m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
  m.objective(maximize(expr`dot(${input.values}, ${selected})`));

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    selected: selected.map((v) => Math.round(v.value!)),
    totalValue: m.objectiveValue!,
  };
}
