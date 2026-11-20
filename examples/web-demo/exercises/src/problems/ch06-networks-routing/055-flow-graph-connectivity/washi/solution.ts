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

  m.constraint(expr`${y[0]} == 1`, "root_active");

  input.edges.forEach((e, idx) => {
    m.constraint(expr`${w[idx]} <= ${y[e.u]}`);
    m.constraint(expr`${w[idx]} <= ${y[e.v]}`);
    m.constraint(expr`${zFwd[idx]} + ${zRev[idx]} <= ${w[idx]}`);
    m.constraint(expr`${fFwd[idx]} <= ${n - 1} * ${zFwd[idx]}`);
    m.constraint(expr`${fRev[idx]} <= ${n - 1} * ${zRev[idx]}`);
  });

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

  m.objective(
    maximize(
      expr`${sum(y.map((yv, v) => expr`${input.prizes[v]} * ${yv}`))} - ${sum(
        w.map((we, idx) => expr`${input.edges[idx].cost} * ${we}`)
      )}`
    )
  );
  await m.solve();

  return {
    selectedNodes: y.map((v) => Math.round(v.value!) || 0),
    selectedEdges: w.map((v) => Math.round(v.value!) || 0),
    netValue: m.objectiveValue!,
  };
}
