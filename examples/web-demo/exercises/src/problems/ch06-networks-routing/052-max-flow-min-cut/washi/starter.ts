import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P052Edge {
  from: number;
  to: number;
  cap: number;
}

export interface P052Input {
  nodeCount: number;
  source: number;
  sink: number;
  edges: P052Edge[];
}

export interface P052Output {
  flows: number[];
  cutEdges: number[];
  maxFlow: number;
}

export async function solve(input: P052Input): Promise<P052Output> {
  // TODO: Build and solve the max-flow LP, extract a minimum s-t cut, and return the output.
  throw new Error("Not implemented");
}
