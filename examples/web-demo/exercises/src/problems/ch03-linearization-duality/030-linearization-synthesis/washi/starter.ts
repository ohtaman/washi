import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P030Input {
  baseCosts: number[];
  values: number[];
  minValue: number;
  loads: number[][];
  targets: number[];
  devWeights: number[];
  peakWeight: number;
  pairs: number[][];
}

export interface P030Output {
  selected: number[];
  pairProducts: number[];
  peakLoad: number;
  totalCost: number;
}

export async function solve(input: P030Input): Promise<P030Output> {
  const n = input.baseCosts.length;
  const mZones = input.loads.length;
  const P = input.pairs.length;
  const m = new Model("LinearizationSynthesis");

  const selected = m.binary(n, { prefix: "x" });
  const pairProducts = m.continuous(P, { lb: 0, ub: 1, prefix: "w" });
  const peakLoad = m.continuous("peak", { lb: 0 });
  const dPlus = m.continuous(mZones, { lb: 0, prefix: "dp" });
  const dMinus = m.continuous(mZones, { lb: 0, prefix: "dm" });

  // TODO:
  // 1. Enforce minimum delivered value: dot(input.values, selected) >= input.minValue
  // 2. Add minimax peak cap constraints: dot(input.loads[r], selected) <= peakLoad for each zone r
  // 3. Add L1 target deviation splits: dot(input.loads[r], selected) - input.targets[r] == dPlus[r] - dMinus[r]
  // 4. Add McCormick linearization for every pair [i, j, cost] at index k: w[k] = selected[i] * selected[j]
  // 5. Minimize base + pair + peak + L1 deviation costs, solve,
  //    and return { selected, pairProducts, peakLoad, totalCost }
  throw new Error("Not implemented");
}
