import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P016Input {
  numTasks: number;
  costs: number[];
  routes: number[][];
}

export interface P016Output {
  selected: number[];
  totalCost: number;
}

export async function solve(input: P016Input): Promise<P016Output> {
  const mCount = input.costs.length;
  const m = new Model("SetPartitioning");
  // Decision variables: binary selected[j] = 1 if route j is chosen.
  const selected = m.binary(mCount, { prefix: "route" });

  // Partitioning constraint: every task i must be covered by exactly one selected route.
  m.constraint(
    Array.from({ length: input.numTasks }, (_, i) =>
      expr`${sum(selected.filter((_, j) => input.routes[j].includes(i)))} == 1`
    )
  );

  // Objective: minimize total cost of selected routes.
  m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    totalCost: m.objectiveValue!,
  };
}
