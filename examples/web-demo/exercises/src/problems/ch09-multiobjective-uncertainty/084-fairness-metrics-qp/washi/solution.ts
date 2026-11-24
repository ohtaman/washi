import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P084Input {
  unitCosts: number[];
  minAlloc: number[];
  maxAlloc: number[];
  totalDemand: number;
  fairnessWeight: number;
}

export interface P084Output {
  allocations: number[];
  totalCost: number;
}

export async function solve(input: P084Input): Promise<P084Output> {
  const n = input.unitCosts.length;
  // Equal-share target used to penalize allocation variance
  const mean = input.totalDemand / n;
  const m = new Model("FairnessQP");

  // Continuous allocation per agent bounded by [minAlloc[i], maxAlloc[i]]
  const x = input.minAlloc.map((lb, i) =>
    m.continuous({ lb, ub: input.maxAlloc[i], name: `x_${i}` })
  );

  // Total demand must be met exactly
  m.constraint(expr`sum(${x}) == ${input.totalDemand}`, "total_demand");
  // Minimize linear cost plus quadratic variance penalty around the equal-share mean
  m.objective(
    minimize(
      expr`dot(${input.unitCosts}, ${x}) + ${input.fairnessWeight} * sum((${x} - ${mean})^2)`
    )
  );
  await m.solve();

  return {
    allocations: x.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
