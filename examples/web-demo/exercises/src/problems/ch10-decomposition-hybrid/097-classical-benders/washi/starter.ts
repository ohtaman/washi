import { Model, BendersCut, Constraint, expr, minimize, sum } from "@ohtaman/washi";

export interface P097Input {
  fixedCosts: number[];
  capacities: number[];
  demands: number[];
  shippingCosts: number[][];
}

export interface P097Output {
  open: number[];
  shipments: number[][];
  totalCost: number;
}

export async function solve(input: P097Input): Promise<P097Output> {
  // TODO: Solve the two-stage facility location problem using Classical Benders Decomposition.
  throw new Error("Not implemented");
}
