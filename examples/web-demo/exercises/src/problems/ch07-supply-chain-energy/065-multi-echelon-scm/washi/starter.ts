import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P065Input {
  plantFixedCosts: number[];
  plantCaps: number[];
  dcFixedCosts: number[];
  dcCaps: number[];
  demands: number[];
  plantDcCosts: number[][];
  dcCustomerCosts: number[][];
}

export interface P065Output {
  openPlants: number[];
  openDcs: number[];
  plantToDc: number[][];
  dcToCustomer: number[][];
  totalCost: number;
}

export async function solve(input: P065Input): Promise<P065Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
