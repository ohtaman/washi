import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P025Input {
  minOrders: number[];
  maxOrders: number[];
  baseCosts: number[];
  discounts: number[];
  contractFees: number[];
  totalDemand: number;
}

export interface P025Output {
  b: number[];
  x: number[];
  z: number[];
  totalCost: number;
}

export async function solve(input: P025Input): Promise<P025Output> {
  const n = input.minOrders.length;
  const m = new Model("GloverProduct");

  const b = m.binary(n, { prefix: "b" });
  const x = input.minOrders.map((lb, i) =>
    m.continuous(`x_${i}`, { lb, ub: input.maxOrders[i] })
  );
  const z = input.maxOrders.map((ub, i) =>
    m.continuous(`z_${i}`, { lb: 0, ub })
  );

  // TODO:
  // 1. Enforce total demand: sum(x) >= input.totalDemand
  // 2. Add exact Glover/McCormick linearization of z[i] = b[i] * x[i] for each i:
  //    z[i] >= minOrders[i] * b[i], z[i] <= maxOrders[i] * b[i],
  //    z[i] >= x[i] - maxOrders[i] * (1 - b[i]), z[i] <= x[i] - minOrders[i] * (1 - b[i])
  // 3. Minimize dot(baseCosts, x) + dot(contractFees, b) - dot(discounts, z),
  //    solve, and return { b, x, z, totalCost }
  throw new Error("Not implemented");
}
