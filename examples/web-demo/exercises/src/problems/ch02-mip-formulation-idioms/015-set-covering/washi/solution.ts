import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P015Input {
  numElements: number;
  costs: number[];
  sets: number[][];
}

export interface P015Output {
  selected: number[];
  totalCost: number;
}

export async function solve(input: P015Input): Promise<P015Output> {
  const mCount = input.costs.length;
  const m = new Model("SetCovering");
  const selected = m.binary(mCount, { prefix: "set" });

  m.constraint(
    Array.from({ length: input.numElements }, (_, i) =>
      expr`${sum(selected.filter((_, j) => input.sets[j].includes(i)))} >= 1`
    )
  );

  m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
  await m.solve();

  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    totalCost: m.objectiveValue!,
  };
}
