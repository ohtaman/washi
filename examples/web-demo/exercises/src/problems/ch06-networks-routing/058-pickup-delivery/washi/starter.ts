import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P058Request {
  pickup: number;
  delivery: number;
  demand: number;
}

export interface P058Input {
  dist: number[][];
  requests: P058Request[];
  capacity: number;
  maxVehicles: number;
  maxStopsPerVehicle: number;
}

export interface P058Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P058Input): Promise<P058Output> {
  const n = input.dist.length;
  const K = input.maxVehicles;
  const Q = input.capacity;
  const m = new Model("PickupDelivery");

  const x = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === j ? null : m.binary(K, { prefix: `x_${i}_${j}` })
    )
  );
  const t = Array.from({ length: n }, (_, i) =>
    m.continuous(`t_${i}`, { lb: i === 0 ? 0 : 1, ub: i === 0 ? 0 : n - 1 })
  );

  // TODO:
  // 1. Enforce each location 1..n-1 is visited once, flow conservation per vehicle, and stop cap <= maxStopsPerVehicle
  // 2. Enforce same-route pairing per request (pickup & delivery on same vehicle k) and precedence t[pickup] + 1 <= t[delivery]
  // 3. Track cumulative vehicle load L[i] in [0, Q] with net delta +demand at pickup and -demand at delivery
  // 4. Minimize total route distance, solve, and reconstruct routes
  throw new Error("Not implemented");
}
