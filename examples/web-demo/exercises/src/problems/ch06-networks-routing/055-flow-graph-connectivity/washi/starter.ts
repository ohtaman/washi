import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P055Edge {
  u: number;
  v: number;
  cost: number;
}

export interface P055Input {
  prizes: number[];
  edges: P055Edge[];
}

export interface P055Output {
  selectedNodes: number[];
  selectedEdges: number[];
  netValue: number;
}

export async function solve(input: P055Input): Promise<P055Output> {
  // TODO: Build and solve the rooted connected subgraph MIP, then return the output.
  throw new Error("Not implemented");
}
