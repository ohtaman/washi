import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P028Input {
  costs: number[];
  yields: number[][];
  minRequirements: number[];
}

export interface P028Output {
  quantities: number[];
  reducedCosts: number[];
  optimalCost: number;
}

export async function solve(input: P028Input): Promise<P028Output> {
  const n = input.costs.length;
  const m = new Model("ReducedCosts");

  // Decision variables: continuous non-negative activity levels quantities[j] >= 0.
  const quantities = m.continuous(n, { lb: 0, prefix: "x" });

  // Minimum requirement constraints for each output k.
  m.constraint(
    input.minRequirements.map(
      (req, k) => expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`
    )
  );

  // Objective: minimize total cost; after solving, read each variable's reduced cost (v.reducedCost!).
  m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
  await m.solve();

  return {
    quantities: quantities.map((v) => v.value!),
    reducedCosts: quantities.map((v) => v.reducedCost!),
    optimalCost: m.objectiveValue!,
  };
}
