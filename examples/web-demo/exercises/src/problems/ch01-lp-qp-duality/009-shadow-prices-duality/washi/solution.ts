import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P009Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export async function solve(input: P009Input) {
  const n = input.margins.length;
  const m = new Model("ShadowPrices");
  const quantities = m.continuous(n, { lb: 0, prefix: "q" });

  const constrs = input.capacities.map((cap, k) =>
    m.constraint(expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`, `res_${k}`)
  );

  m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  const shadowPrices = constrs.map((c) => c.dual ?? 0);
  const slacks = constrs.map((c) => c.slack ?? 0);

  return {
    quantities: quantities.map((v) => v.value!),
    optimalProfit: m.objectiveValue!,
    shadowPrices,
    slacks,
    isBottleneck: shadowPrices.map((d) => d > 1e-5),
  };
}
