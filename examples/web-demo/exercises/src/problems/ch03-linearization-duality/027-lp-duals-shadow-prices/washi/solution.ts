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

  // Decision variables: continuous production quantities[i] in [0, capacities[i]].
  const quantities = input.capacities.map((cap, i) =>
    m.continuous(`x_${i}`, { lb: 0, ub: cap })
  );

  // Retain constraint handles to query LP dual values (shadow prices) after solving.
  // Minimum yield requirements (>=) and maximum resource limits (<=).
  const reqConstrs = input.minRequirements.map((req, k) =>
    m.constraint(expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`, `req_${k}`)
  );
  const capConstrs = input.maxResources.map((cap, l) =>
    m.constraint(
      expr`dot(${input.resourceUsages[l]}, ${quantities}) <= ${cap}`,
      `cap_${l}`
    )
  );

  // Objective: minimize total production cost.
  m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
  await m.solve();

  // Extract primal quantities and dual shadow prices (c.dual!) in constraint order.
  return {
    quantities: quantities.map((v) => v.value!),
    duals: [...reqConstrs, ...capConstrs].map((c) => c.dual!),
    optimalCost: m.objectiveValue!,
  };
}
