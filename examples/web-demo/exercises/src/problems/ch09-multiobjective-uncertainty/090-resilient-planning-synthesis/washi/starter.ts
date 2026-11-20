import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P090Input {
  fixedCosts: number[];
  capacities: number[];
  dropAmounts: number[];
  gamma: number;
  robustMinCap: number;
  probs: number[];
  demands: number[];
  offline: number[][];
  disruptionCost: number;
  shortfallPenalty: number;
}

export interface P090Output {
  committed: number[];
  recovered: number[][];
  totalCost: number;
}

export async function solve(input: P090Input): Promise<P090Output> {
  const n = input.fixedCosts.length;
  const S = input.probs.length;
  const m = new Model("ResilientPlanningSynthesis");

  const y = m.binary(n, { prefix: "y" });
  const z = m.continuous("z", { lb: 0 });
  const p = m.continuous(n, { lb: 0, prefix: "p" });

  const w = input.probs.map((_, s) => m.binary(n, { prefix: `w_${s}` }));
  const diff = input.probs.map((_, s) =>
    m.continuous(n, { lb: 0, ub: 1, prefix: `d_${s}` })
  );
  const shortfall = m.continuous(S, { lb: 0, prefix: "u" });

  // TODO:
  // 1. Add Stage-1 Bertsimas-Sim robust capacity guarantee:
  //    dot(capacities, y) - gamma * z - sum(p) >= robustMinCap, with z + p[j] >= dropAmounts[j] * y[j]
  // 2. For each scenario s:
  //    - Forbid offline units: w[s][j] == 0 if offline[s][j] === 1
  //    - Enforce elastic demand cover: dot(capacities, w[s]) + shortfall[s] >= demands[s]
  //    - Linearize Hamming recovery switch: diff[s][j] >= w[s][j] - y[j] and diff[s][j] >= y[j] - w[s][j]
  // 3. Minimize fixedCosts + expected (disruptionCost * sum(diff[s]) + shortfallPenalty * shortfall[s])
  // 4. Solve and return { committed, recovered, totalCost }
  throw new Error("Not implemented");
}
