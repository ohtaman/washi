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
  const n = input.prizes.length;
  const mEdges = input.edges.length;
  const m = new Model("FlowConnectivity");

  const y = m.binary(n, { prefix: "y" });
  const w = m.binary(mEdges, { prefix: "w" });
  const zFwd = m.binary(mEdges, { prefix: "zf" });
  const zRev = m.binary(mEdges, { prefix: "zr" });
  const fFwd = m.continuous(mEdges, { lb: 0, ub: n - 1, prefix: "ff" });
  const fRev = m.continuous(mEdges, { lb: 0, ub: n - 1, prefix: "fr" });

  // TODO:
  // 1. Pin root node: y[0] == 1
  // 2. Link edge selection and directed flow capacity:
  //    w[e] <= y[u], w[e] <= y[v], zFwd[e] + zRev[e] <= w[e],
  //    fFwd[e] <= (n - 1) * zFwd[e], fRev[e] <= (n - 1) * zRev[e]
  // 3. Enforce single-commodity flow connectivity from root 0:
  //    outflow(0) - inflow(0) == sum(y[1..n-1]), and inflow(v) - outflow(v) == y[v] for v >= 1
  // 4. Maximize sum(prizes[v] * y[v]) - sum(edges[e].cost * w[e]), solve, and return result
  throw new Error("Not implemented");
}
