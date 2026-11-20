import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P027Input {
  costs: number[];
  capacities: number[];
  yields: number[][];
  minRequirements: number[];
  resourceUsages: number[][];
  maxResources: number[];
}

export interface P027Output {
  quantities: number[];
  duals: number[];
  optimalCost: number;
}

export async function solve(input: P027Input): Promise<P027Output> {
  const m = new Model("ShadowPrices");

  const quantities = input.capacities.map((cap, i) =>
    m.continuous(`x_${i}`, { lb: 0, ub: cap })
  );

  const reqConstrs = input.minRequirements.map((req, k) =>
    m.constraint(expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`, `req_${k}`)
  );
  const capConstrs = input.maxResources.map((cap, l) =>
    m.constraint(
      expr`dot(${input.resourceUsages[l]}, ${quantities}) <= ${cap}`,
      `cap_${l}`
    )
  );

  m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
  await m.solve();

  return {
    quantities: quantities.map((v) => v.value!),
    duals: [...reqConstrs, ...capConstrs].map((c) => c.dual!),
    optimalCost: m.objectiveValue!,
  };
}
