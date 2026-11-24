import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P013ExactGroup {
  indices: number[];
  count: number;
}

export interface P013Input {
  budget: number;
  costs: number[];
  values: number[];
  mutexGroups: number[][];
  exactGroups: P013ExactGroup[];
  atLeastOneGroups: number[][];
}

export interface P013Output {
  selected: number[];
  totalValue: number;
}

export async function solve(input: P013Input): Promise<P013Output> {
  const n = input.costs.length;
  const m = new Model("CardinalitySelection");
  // Decision variables: binary indicator (1 if item i is selected, 0 otherwise).
  const selected = m.binary(n, { prefix: "sel" });

  // Budget limit and group cardinality constraints: at most 1 (mutex), exact count, and at least 1.
  m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
  m.constraint(
    input.mutexGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} <= 1`)
  );
  m.constraint(
    input.exactGroups.map(
      (g) => expr`${sum(g.indices.map((i) => selected[i]))} == ${g.count}`
    )
  );
  m.constraint(
    input.atLeastOneGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} >= 1`)
  );

  // Objective: maximize total value of selected items.
  m.objective(maximize(expr`dot(${input.values}, ${selected})`));
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    totalValue: m.objectiveValue!,
  };
}
