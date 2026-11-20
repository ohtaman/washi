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
  const m = new Model("RCSP");
  const x = m.binary(input.edges.length, { prefix: "x" });

  // TODO:
  // 1. Add s->t unit flow conservation for each node v in 0..input.nodeCount-1
  //    (outflow - inflow == 1 at source, -1 at sink, 0 elsewhere)
  // 2. Enforce total resource <= input.maxResource
  // 3. Minimize total path cost, solve, and return
  //    { selected: x.map((v) => Math.round(v.value!) || 0), totalCost: m.objectiveValue! }
  throw new Error("Not implemented");
}
