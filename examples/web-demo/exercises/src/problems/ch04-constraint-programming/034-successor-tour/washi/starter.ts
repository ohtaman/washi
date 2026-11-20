import { Model, at, distinct, expr, implies, minimize, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P034Input {
  distances: number[][];
}

export interface P034Output {
  next: number[];
  totalDistance: number;
}

export async function solve(input: P034Input): Promise<P034Output> {
  const n = input.distances.length;
  const m = new Model("SuccessorTour");

  const next = m.integer(n, { lb: 0, ub: n - 1, prefix: "next" });
  const rank = m.integer(n, { lb: 0, ub: n - 1, prefix: "rank" });

  m.constraint(distinct(next), "distinct_next");
  m.constraint(next.map((nx, i) => expr`${nx} != ${i}`));

  // TODO: Eliminate disjoint subtours using rank:
  // 1. rank[0] == 0, distinct(rank), and at(rank, next[0]) == 1
  // 2. For i >= 1: implies(expr`${next[i]} != 0`, expr`at(${rank}, ${next[i]}) == ${rank[i]} + 1`)

  m.objective(minimize(sum(input.distances.map((row, i) => at(row, next[i])))));
  await m.solve({ solver: "pumpkin" });

  return {
    next: next.map((v) => Math.round(v.value!) || 0),
    totalDistance: Math.round(m.objectiveValue!) || 0,
  };
}
