import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P011Input {
  margins: number[];
  minBatches: number[];
  maxBatches: number[];
  resourceUsages: number[];
  resourceCap: number;
}

export interface P011Output {
  active: number[];
  quantities: number[];
  totalMargin: number;
}

export async function solve(input: P011Input): Promise<P011Output> {
  const n = input.margins.length;
  const m = new Model("SemiContinuousProduction");

  // Decision variables: binary active[i] (whether product i is made) and continuous quantities[i] >= 0.
  const active = m.binary(n, { prefix: "active" });
  const quantities = m.continuous(n, { lb: 0, prefix: "qty" });

  // Semi-continuous domain: quantities[i] is either 0 (active[i]=0) or in [minBatches[i], maxBatches[i]] (active[i]=1).
  m.constraint(
    quantities.map((qty, i) => expr`${input.minBatches[i]} * ${active[i]} <= ${qty}`)
  );
  m.constraint(
    quantities.map((qty, i) => expr`${qty} <= ${input.maxBatches[i]} * ${active[i]}`)
  );
  // Shared resource capacity constraint.
  m.constraint(
    expr`dot(${input.resourceUsages}, ${quantities}) <= ${input.resourceCap}`,
    "resource"
  );

  // Objective: maximize total margin across all products.
  m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    active: active.map((v) => Math.round(v.value!) || 0),
    quantities: quantities.map((v) => v.value!),
    totalMargin: m.objectiveValue!,
  };
}
