import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P059Input {
  dist: number[][];
  demands: number[];
  vehicleCapacity: number;
  depotMaxVehicles: number[];
  depotCapacities: number[];
}

export interface P059Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P059Input): Promise<P059Output> {
  const n = input.dist.length;
  const D = input.depotMaxVehicles.length;
  const Q = input.vehicleCapacity;
  const m = new Model("MultiDepotVRP");

  // Depot-tagged arcs x[d][i][j] restrict each route to nodes {d} U {D..n-1}
  const x = Array.from({ length: D }, (_, d) => {
    const nodes = [d, ...Array.from({ length: n - D }, (_, k) => D + k)];
    const map = new Map<string, ReturnType<Model["binary"]>>();
    for (const i of nodes) {
      for (const j of nodes) {
        if (i !== j) map.set(`${i}_${j}`, m.binary(`x_${d}_${i}_${j}`));
      }
    }
    return map;
  });
  const u = Array.from({ length: n - D }, (_, k) =>
    m.continuous(`u_${D + k}`, { lb: input.demands[D + k], ub: Q })
  );

  // TODO:
  // 1. Each customer i in D..n-1 is visited once overall across all depots
  // 2. For each depot d: flow conservation per customer, out(d) == in(d) <= depotMaxVehicles[d],
  //    and total demand served by depot d <= depotCapacities[d]
  // 3. Load-tracking MTZ for i != j in D..n-1: u[i] - u[j] + Q * sum_d x[d][i][j] <= Q - demands[j]
  // 4. Minimize total distance, solve, and reconstruct routes starting/ending at the same depot d
  throw new Error("Not implemented");
}
