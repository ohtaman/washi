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
  m.constraint(distinct(rank), "distinct_rank");
  m.constraint(next.map((nx, i) => expr`${nx} != ${i}`));

  m.constraint(expr`${rank[0]} == 0`, "rank_start");
  m.constraint(expr`at(${rank}, ${next[0]}) == 1`, "rank_first_step");
  m.constraint(
    next.slice(1).map((nx, idx) => {
      const i = idx + 1;
      return implies(expr`${nx} != 0`, expr`at(${rank}, ${nx}) == ${rank[i]} + 1`);
    })
  );

  m.objective(minimize(sum(input.distances.map((row, i) => at(row, next[i])))));
  await m.solve({ solver: "pumpkin" });

  return {
    next: next.map((v) => Math.round(v.value!) || 0),
    totalDistance: Math.round(m.objectiveValue!) || 0,
  };
}
