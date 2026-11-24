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

  // y[v]: binary indicator that node v is selected
  // w[e]: binary indicator that undirected edge e is purchased
  // zFwd[e], zRev[e]: directed orientation indicators for flow on edge e
  // fFwd[e], fRev[e]: continuous single-commodity connectivity flow in [0, n-1]
  const y = m.binary(n, { prefix: "y" });
  const w = m.binary(mEdges, { prefix: "w" });
  const zFwd = m.binary(mEdges, { prefix: "zf" });
  const zRev = m.binary(mEdges, { prefix: "zr" });
  const fFwd = m.continuous(mEdges, { lb: 0, ub: n - 1, prefix: "ff" });
  const fRev = m.continuous(mEdges, { lb: 0, ub: n - 1, prefix: "fr" });

  // Root node 0 must be active to anchor the connected component
  m.constraint(expr`${y[0]} == 1`, "root_active");

  // Edge activation and flow capacity coupling: an edge can carry flow in at most one direction
  // and only if both endpoints and the edge itself are selected
  input.edges.forEach((e, idx) => {
    m.constraint(expr`${w[idx]} <= ${y[e.u]}`);
    m.constraint(expr`${w[idx]} <= ${y[e.v]}`);
    m.constraint(expr`${zFwd[idx]} + ${zRev[idx]} <= ${w[idx]}`);
    m.constraint(expr`${fFwd[idx]} <= ${n - 1} * ${zFwd[idx]}`);
    m.constraint(expr`${fRev[idx]} <= ${n - 1} * ${zRev[idx]}`);
  });

  // Connectivity flow: root 0 supplies 1 unit of flow to every other selected node v (y[v])
  const nonRootSum = sum(y.slice(1));
  for (let v = 0; v < n; v++) {
    const inFlows = [
      ...fFwd.filter((_, idx) => input.edges[idx].v === v),
      ...fRev.filter((_, idx) => input.edges[idx].u === v),
    ];
    const outFlows = [
      ...fFwd.filter((_, idx) => input.edges[idx].u === v),
      ...fRev.filter((_, idx) => input.edges[idx].v === v),
    ];
    if (v === 0) {
      m.constraint(expr`${sum(outFlows)} - ${sum(inFlows)} == ${nonRootSum}`);
    } else {
      m.constraint(expr`${sum(inFlows)} - ${sum(outFlows)} == ${y[v]}`);
    }
  }

  // Maximize net value: total selected node prizes minus purchased edge costs
  m.objective(
    maximize(
      expr`${sum(y.map((yv, v) => expr`${input.prizes[v]} * ${yv}`))} - ${sum(
        w.map((we, idx) => expr`${input.edges[idx].cost} * ${we}`)
      )}`
    )
  );
  await m.solve();

  // Round binary indicators to clean integers and normalize -0 to 0
  return {
    selectedNodes: y.map((v) => Math.round(v.value!) || 0),
    selectedEdges: w.map((v) => Math.round(v.value!) || 0),
    netValue: m.objectiveValue!,
  };
}
