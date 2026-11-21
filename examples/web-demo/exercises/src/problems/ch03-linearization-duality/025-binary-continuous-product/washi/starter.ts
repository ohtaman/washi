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

  // TODO: Build and solve the linearized contract procurement MIP, then return the output.
  throw new Error("Not implemented");
}
