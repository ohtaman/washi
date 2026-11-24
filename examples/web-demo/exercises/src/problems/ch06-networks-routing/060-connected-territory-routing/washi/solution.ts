import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P060Input {
  numTerritories: number;
  demands: number[];
  demandBounds: number[];
  hubCosts: number[];
  adjEdges: number[][];
  dist: number[][];
}

export interface P060Territory {
  hub: number;
  tour: number[];
}

export interface P060Output {
  territories: P060Territory[];
  totalCost: number;
}

export async function solve(input: P060Input): Promise<P060Output> {
  const n = input.demands.length;
  const K = input.numTerritories;
  const [minDemand, maxDemand] = input.demandBounds;
  const m = new Model("ConnectedTerritoryRouting");

  // y[i][k]: node i assigned to territory k; h[i][k]: node i chosen as hub of territory k
  // s[i][k]: connectivity flow supply injected at hub i for territory k (0 if not hub)
  // fFwd[e][k], fRev[e][k]: directed connectivity flow on adjacency edge e for territory k
  // x[i][j]: binary intra-territory TSP arc indicator; u[i]: MTZ visit-order variable
  const y = Array.from({ length: n }, (_, i) => m.binary(K, { prefix: `y_${i}` }));
  const h = Array.from({ length: n }, (_, i) => m.binary(K, { prefix: `h_${i}` }));
  const s = Array.from({ length: n }, (_, i) =>
    m.continuous(K, { lb: 0, ub: n, prefix: `s_${i}` })
  );
  const fFwd = input.adjEdges.map((_, e) =>
    m.continuous(K, { lb: 0, ub: n - 1, prefix: `ff_${e}` })
  );
  const fRev = input.adjEdges.map((_, e) =>
    m.continuous(K, { lb: 0, ub: n - 1, prefix: `fr_${e}` })
  );
  const x = input.dist.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const u = m.continuous(n, { lb: 0, ub: n - 1, prefix: "u" });

  // Zone partitioning, hub assignment, and balanced demand limits
  for (let i = 0; i < n; i++) {
    m.constraint(expr`${sum(y[i])} == 1`);
  }
  for (let k = 0; k < K; k++) {
    m.constraint(expr`${sum(h.map((row) => row[k]))} == 1`);
    const terDemand = sum(y.map((row, i) => expr`${input.demands[i]} * ${row[k]}`));
    m.constraint(expr`${terDemand} >= ${minDemand}`);
    m.constraint(expr`${terDemand} <= ${maxDemand}`);
    for (let i = 0; i < n; i++) {
      m.constraint(expr`${h[i][k]} <= ${y[i][k]}`);
      m.constraint(expr`${s[i][k]} <= ${n} * ${h[i][k]}`);
    }
  }

  // Symmetry breaking on territory hub indices
  for (let k = 0; k < K - 1; k++) {
    const idxK = sum(h.map((row, i) => expr`${i} * ${row[k]}`));
    const idxNext = sum(h.map((row, i) => expr`${i} * ${row[k + 1]}`));
    m.constraint(expr`${idxK} + 1 <= ${idxNext}`);
  }

  // Single-commodity flow connectivity per territory along adjEdges
  input.adjEdges.forEach(([eu, ev], eIdx) => {
    for (let k = 0; k < K; k++) {
      m.constraint(expr`${fFwd[eIdx][k]} <= ${n - 1} * ${y[eu][k]}`);
      m.constraint(expr`${fFwd[eIdx][k]} <= ${n - 1} * ${y[ev][k]}`);
      m.constraint(expr`${fRev[eIdx][k]} <= ${n - 1} * ${y[eu][k]}`);
      m.constraint(expr`${fRev[eIdx][k]} <= ${n - 1} * ${y[ev][k]}`);
    }
  });

  for (let i = 0; i < n; i++) {
    for (let k = 0; k < K; k++) {
      const inFlows = [
        ...fFwd.filter((_, eIdx) => input.adjEdges[eIdx][1] === i).map((arr) => arr[k]),
        ...fRev.filter((_, eIdx) => input.adjEdges[eIdx][0] === i).map((arr) => arr[k]),
      ];
      const outFlows = [
        ...fFwd.filter((_, eIdx) => input.adjEdges[eIdx][0] === i).map((arr) => arr[k]),
        ...fRev.filter((_, eIdx) => input.adjEdges[eIdx][1] === i).map((arr) => arr[k]),
      ];
      m.constraint(expr`${s[i][k]} + ${sum(inFlows)} - ${sum(outFlows)} == ${y[i][k]}`);
    }
  }

  // Intra-territory TSP tours with hub-anchored MTZ subtour elimination
  for (let i = 0; i < n; i++) {
    m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
    m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      for (let k = 0; k < K; k++) {
        m.constraint(expr`${y[i][k]} - ${y[j][k]} <= 1 - ${x[i][j]!}`);
      }
      const isHubJ = sum(h[j]);
      m.constraint(expr`${u[i]} + 1 - ${u[j]} <= ${n} * (1 - ${x[i][j]!} + ${isHubJ})`);
    }
  }

  // Minimize total hub opening cost plus intra-territory TSP tour distance
  const hubTerm = sum(h.flatMap((row, i) => row.map((v) => expr`${input.hubCosts[i]} * ${v}`)));
  const tourTerm = sum(
    x.flatMap((row, i) => row.map((v, j) => (v ? expr`${input.dist[i][j]} * ${v}` : 0)))
  );
  m.objective(minimize(expr`${hubTerm} + ${tourTerm}`));
  await m.solve();

  // Reconstruct each territory's closed TSP tour starting from its hub
  const territories: P060Territory[] = [];
  for (let k = 0; k < K; k++) {
    const hub = h.findIndex((row) => Math.round(row[k].value!) === 1);
    const tour = [hub];
    let cur = hub;
    while (true) {
      const nxt = x[cur].findIndex((v) => v !== null && Math.round(v.value!) === 1);
      tour.push(nxt);
      if (nxt === hub) break;
      cur = nxt;
    }
    territories.push({ hub, tour });
  }

  return {
    territories,
    totalCost: m.objectiveValue!,
  };
}
