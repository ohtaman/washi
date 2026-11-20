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
  const selected = m.binary(mCount, { prefix: "route" });

  m.constraint(
    Array.from({ length: input.numTasks }, (_, i) =>
      expr`${sum(selected.filter((_, j) => input.routes[j].includes(i)))} == 1`
    )
  );

  m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
  await m.solve();

  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    totalCost: m.objectiveValue!,
  };
}
