import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P051Edge {
  from: number;
  to: number;
  cap: number;
  cost: number;
}

export interface P051Input {
  supplies: number[];
  edges: P051Edge[];
}

export interface P051Output {
  flows: number[];
  totalCost: number;
}

export async function solve(input: P051Input): Promise<P051Output> {
  // TODO: Build and solve the continuous min-cost flow LP, then return the output.
  throw new Error("Not implemented");
}
