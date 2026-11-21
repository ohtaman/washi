import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P067Input {
  demands: number[];
  unitCosts: number[][];
  fixedCosts: number[];
  minOrders: number[];
  maxOrders: number[];
  maxShare: number;
  minSuppliers: number;
  maxSuppliers: number;
}

export interface P067Output {
  active: number[];
  allocations: number[][];
  totalCost: number;
}

export async function solve(input: P067Input): Promise<P067Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
