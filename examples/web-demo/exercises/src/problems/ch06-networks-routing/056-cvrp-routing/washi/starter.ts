import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P056Input {
  dist: number[][];
  demands: number[];
  capacity: number;
  maxVehicles: number;
}

export interface P056Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P056Input): Promise<P056Output> {
  const n = input.dist.length;
  const Q = input.capacity;
  const m = new Model("CVRP");

  const x = input.dist.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const u = input.demands.map((d, i) =>
    i === 0 ? null : m.continuous(`u_${i}`, { lb: d, ub: Q })
  );

  // TODO:
  // 1. Customer degree == 1 (in and out) for i in 1..n-1
  // 2. Depot degree balance: out(0) == in(0) <= input.maxVehicles
  // 3. Load-tracking MTZ for i != j in 1..n-1: u[i] - u[j] + Q * x[i][j] <= Q - demands[j]
  // 4. Minimize total distance, solve, and reconstruct routes starting/ending at 0
  throw new Error("Not implemented");
}
