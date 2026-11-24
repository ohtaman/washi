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
  // Decision variables: binary indicator (1 if project i is selected, 0 otherwise).
  const selected = m.binary(n, { prefix: "sel" });

  // Knapsack capacity constraint: total cost of selected projects cannot exceed budget.
  m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
  // Objective: maximize total value of selected projects.
  m.objective(maximize(expr`dot(${input.values}, ${selected})`));
  await m.solve();

  // Round binary values to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    totalValue: m.objectiveValue!,
  };
}
