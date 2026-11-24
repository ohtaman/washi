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

  // Decision variables:
  // - selected[i]: binary indicator for selecting item i
  // - pairProducts[k]: continuous in [0, 1] representing x_i * x_j (forced to {0, 1} by binary selected)
  // - peakLoad >= 0: epigraph variable for minimax zone load
  // - dPlus[r], dMinus[r] >= 0: positive/negative deviations from zone target[r] for L1 penalty
  const selected = m.binary(n, { prefix: "x" });
  const pairProducts = m.continuous(P, { lb: 0, ub: 1, prefix: "w" });
  const peakLoad = m.continuous("peak", { lb: 0 });
  const dPlus = m.continuous(mZones, { lb: 0, prefix: "dp" });
  const dMinus = m.continuous(mZones, { lb: 0, prefix: "dm" });

  // Minimum total value requirement.
  m.constraint(expr`dot(${input.values}, ${selected}) >= ${input.minValue}`, "min_val");
  // Zone load constraints: minimax bound (load <= peakLoad) and L1 target deviation split.
  m.constraint(
    input.loads.flatMap((row, r) => [
      expr`dot(${row}, ${selected}) <= ${peakLoad}`,
      expr`dot(${row}, ${selected}) - ${input.targets[r]} == ${dPlus[r]} - ${dMinus[r]}`,
    ])
  );
  // Fortet/McCormick linearization of w_k = x_i * x_j (handles both positive and negative pair costs).
  m.constraint(
    input.pairs.flatMap(([i, j], k) => [
      expr`${pairProducts[k]} <= ${selected[i]}`,
      expr`${pairProducts[k]} <= ${selected[j]}`,
      expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
    ])
  );

  // Objective: minimize base costs + pairwise interaction costs + weighted peak load + weighted L1 deviations.
  const pairCosts = input.pairs.map(([, , s]) => s);
  m.objective(
    minimize(
      expr`dot(${input.baseCosts}, ${selected}) + dot(${pairCosts}, ${pairProducts}) + ${input.peakWeight} * ${peakLoad} + dot(${input.devWeights}, ${dPlus}) + dot(${input.devWeights}, ${dMinus})`
    )
  );
  await m.solve();

  // Round binary/linearized indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    pairProducts: pairProducts.map((v) => Math.round(v.value!) || 0),
    peakLoad: peakLoad.value!,
    totalCost: m.objectiveValue!,
  };
}
