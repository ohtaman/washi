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

  m.constraint(
    expr`dot(${input.capacities}, ${y}) - ${input.gamma} * ${z} - sum(${p}) >= ${input.robustMinCap}`,
    "robust_min_cap"
  );
  m.constraint(
    input.dropAmounts.map((drop, j) => expr`${z} + ${p[j]} >= ${drop} * ${y[j]}`)
  );

  m.constraint(
    w.flatMap((row, s) =>
      row
        .filter((_, j) => input.offline[s][j] === 1)
        .map((v) => expr`${v} == 0`)
    )
  );
  m.constraint(
    input.demands.map(
      (dem, s) => expr`dot(${input.capacities}, ${w[s]}) + ${shortfall[s]} >= ${dem}`
    )
  );
  m.constraint(
    w.flatMap((row, s) =>
      row.flatMap((wsj, j) => [
        expr`${diff[s][j]} >= ${wsj} - ${y[j]}`,
        expr`${diff[s][j]} >= ${y[j]} - ${wsj}`,
      ])
    )
  );

  const stage2Expected = sum(
    input.probs.map(
      (prob, s) =>
        expr`${prob} * (${input.disruptionCost} * sum(${diff[s]}) + ${input.shortfallPenalty} * ${shortfall[s]})`
    )
  );
  m.objective(minimize(expr`dot(${input.fixedCosts}, ${y}) + ${stage2Expected}`));
  await m.solve();

  return {
    committed: y.map((v) => Math.round(v.value!) || 0),
    recovered: w.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    totalCost: m.objectiveValue!,
  };
}
