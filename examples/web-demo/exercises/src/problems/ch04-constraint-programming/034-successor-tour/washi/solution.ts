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

  // next[i]: successor node visited immediately after node i (0..n-1)
  // rank[i]: visit order index of node i in the tour starting at node 0 (0..n-1)
  const next = m.integer(n, { lb: 0, ub: n - 1, prefix: "next" });
  const rank = m.integer(n, { lb: 0, ub: n - 1, prefix: "rank" });

  // Enforce a permutation without self-loops (every node has a unique successor != itself)
  m.constraint(distinct(next), "distinct_next");
  m.constraint(distinct(rank), "distinct_rank");
  m.constraint(next.map((nx, i) => expr`${nx} != ${i}`));

  // Subtour elimination via sequential ranks: node 0 has rank 0, and every edge i -> next[i]
  // (except closing back to 0) increments rank by 1, forcing a single Hamiltonian cycle
  m.constraint(expr`${rank[0]} == 0`, "rank_start");
  m.constraint(expr`at(${rank}, ${next[0]}) == 1`, "rank_first_step");
  m.constraint(
    next.slice(1).map((nx, idx) => {
      const i = idx + 1;
      return implies(expr`${nx} != 0`, expr`at(${rank}, ${nx}) == ${rank[i]} + 1`);
    })
  );

  // Minimize total tour distance using element indexing (at) on each node's distance row
  m.objective(minimize(sum(input.distances.map((row, i) => at(row, next[i])))));
  await m.solve({ solver: "pumpkin" });

  // Round solver output to clean integers and normalize -0 to 0
  return {
    next: next.map((v) => Math.round(v.value!) || 0),
    totalDistance: Math.round(m.objectiveValue!) || 0,
  };
}
