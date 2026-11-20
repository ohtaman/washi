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

  const active = m.binary(n, { prefix: "active" });
  const quantities = m.continuous(n, { lb: 0, prefix: "qty" });

  m.constraint(
    quantities.map((qty, i) => expr`${input.minBatches[i]} * ${active[i]} <= ${qty}`)
  );
  m.constraint(
    quantities.map((qty, i) => expr`${qty} <= ${input.maxBatches[i]} * ${active[i]}`)
  );
  m.constraint(
    expr`dot(${input.resourceUsages}, ${quantities}) <= ${input.resourceCap}`,
    "resource"
  );

  m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
  await m.solve();

  return {
    active: active.map((v) => Math.round(v.value!) || 0),
    quantities: quantities.map((v) => v.value!),
    totalMargin: m.objectiveValue!,
  };
}
