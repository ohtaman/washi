import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P053Edge {
  from: number;
  to: number;
  cost: number;
  resource: number;
}

export interface P053Input {
  nodeCount: number;
  source: number;
  sink: number;
  maxResource: number;
  edges: P053Edge[];
}

export interface P053Output {
  selected: number[];
  totalCost: number;
}

export async function solve(input: P053Input): Promise<P053Output> {
  // TODO: Build and solve the resource-constrained shortest path MIP, then return the output.
  throw new Error("Not implemented");
}
