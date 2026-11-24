import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P004Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export interface P004Output {
  quantities: number[];
  totalProfit: number;
}

export async function solve(input: P004Input): Promise<P004Output> {
  const m = new Model("ProductMix");
  // Decision variables: continuous non-negative production quantity for each product.
  const quantities = m.continuous(input.margins.length, { lb: 0, prefix: "q" });

  // Resource capacity constraints: total usage of resource k cannot exceed its capacity.
  m.constraint(
    input.capacities.map(
      (cap, k) => expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`
    )
  );

  // Objective: maximize total profit across all products.
  m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
  await m.solve();

  return {
    quantities: quantities.map((v) => v.value!),
    totalProfit: m.objectiveValue!,
  };
}
