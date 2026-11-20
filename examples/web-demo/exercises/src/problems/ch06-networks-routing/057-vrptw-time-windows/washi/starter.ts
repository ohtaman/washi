import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P057Input {
  dist: number[][];
  earliest: number[];
  latest: number[];
  service: number[];
  maxVehicles: number;
}

export interface P057Output {
  routes: number[][];
  totalCost: number;
}

export async function solve(input: P057Input): Promise<P057Output> {
  const n = input.dist.length;
  const m = new Model("VRPTW");

  const x = input.dist.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const t = input.dist.map((_, i) =>
    m.continuous(`t_${i}`, { lb: input.earliest[i], ub: input.latest[i] })
  );

  // TODO:
  // 1. Pin depot departure t[0] == earliest[0], enforce customer degree == 1,
  //    and depot degree balance out(0) == in(0) <= input.maxVehicles
  // 2. Add Big-M time-window precedence constraints for arcs (0 -> j), (i -> j), and return (i -> 0):
  //    t[i] + service[i] + dist[i][j] - t[j] <= M * (1 - x[i][j])
  // 3. Minimize total travel cost, solve, and reconstruct routes
  throw new Error("Not implemented");
}
