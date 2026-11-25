import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P026Input {
  power: number[];
  costs: number[];
  budget: number;
  maxPartySize: number;
  pairs: number[][];
}

export interface P026Output {
  selected: number[];
  pairProducts: number[];
  totalValue: number;
}

export async function solve(input: P026Input): Promise<P026Output> {
  const n = input.power.length;
  const P = input.pairs.length;
  const m = new Model("RpgPartySynergy");

  // Decision variables: binary selected[i] (hero i recruited) and continuous pairProducts[k] in [0, 1]
  // representing selected[i] * selected[j]. Continuous [0, 1] suffices because McCormick inequalities
  // with binary selected[i], selected[j] force pairProducts[k] to 0 or 1.
  const selected = m.binary(n, { prefix: "x" });
  const pairProducts = m.continuous(P, { lb: 0, ub: 1, prefix: "w" });

  // Recruitment budget and maximum party size constraints.
  m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
  m.constraint(expr`sum(${selected}) <= ${input.maxPartySize}`, "party_size");
  // Fortet/McCormick linearization of w_k = x_i * x_j for binary x_i, x_j.
  m.constraint(
    input.pairs.flatMap(([i, j], k) => [
      expr`${pairProducts[k]} <= ${selected[i]}`,
      expr`${pairProducts[k]} <= ${selected[j]}`,
      expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
    ])
  );

  // Objective: maximize individual hero power plus pairwise synergy bonuses.
  const bonuses = input.pairs.map(([, , s]) => s);
  m.objective(
    maximize(
      expr`dot(${input.power}, ${selected}) + dot(${bonuses}, ${pairProducts})`
    )
  );
  await m.solve();

  // Round binary/linearized indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    pairProducts: pairProducts.map((v) => Math.round(v.value!) || 0),
    totalValue: m.objectiveValue!,
  };
}
