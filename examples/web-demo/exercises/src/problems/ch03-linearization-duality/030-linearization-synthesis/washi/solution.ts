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

  m.constraint(expr`dot(${input.values}, ${selected}) >= ${input.minValue}`, "min_val");
  m.constraint(
    input.loads.flatMap((row, r) => [
      expr`dot(${row}, ${selected}) <= ${peakLoad}`,
      expr`dot(${row}, ${selected}) - ${input.targets[r]} == ${dPlus[r]} - ${dMinus[r]}`,
    ])
  );
  m.constraint(
    input.pairs.flatMap(([i, j], k) => [
      expr`${pairProducts[k]} <= ${selected[i]}`,
      expr`${pairProducts[k]} <= ${selected[j]}`,
      expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
    ])
  );

  const pairCosts = input.pairs.map(([, , s]) => s);
  m.objective(
    minimize(
      expr`dot(${input.baseCosts}, ${selected}) + dot(${pairCosts}, ${pairProducts}) + ${input.peakWeight} * ${peakLoad} + dot(${input.devWeights}, ${dPlus}) + dot(${input.devWeights}, ${dMinus})`
    )
  );
  await m.solve();

  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    pairProducts: pairProducts.map((v) => Math.round(v.value!) || 0),
    peakLoad: peakLoad.value!,
    totalCost: m.objectiveValue!,
  };
}
