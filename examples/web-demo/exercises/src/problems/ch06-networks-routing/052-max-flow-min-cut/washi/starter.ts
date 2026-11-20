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
  const n = input.nodeCount;
  const m = new Model("MaxFlowMinCut");

  const flows = input.edges.map((e, i) =>
    m.continuous(`f_${i}`, { lb: 0, ub: e.cap })
  );

  // TODO:
  // 1. Add flow conservation outflow(v) - inflow(v) == 0 for every v != source, sink
  // 2. Maximize net flow out of input.source (outflow(source) - inflow(source)) and call `await m.solve()`
  // 3. Find the reachable vertex set S from input.source in the residual graph
  //    (forward arc u->v if flow < cap - 1e-6; backward arc v->u if flow > 1e-6),
  //    then extract cutEdges = indices i where edges[i].from is in S and edges[i].to is not in S.
  throw new Error("Not implemented");
}
