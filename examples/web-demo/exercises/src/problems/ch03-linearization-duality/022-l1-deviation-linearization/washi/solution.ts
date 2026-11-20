import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P022Input {
  targets: number[];
  weights: number[];
  upperBounds: number[];
  costs: number[];
  budget: number;
  totalOutput: number;
}

export interface P022Output {
  allocations: number[];
  totalDeviation: number;
}

export async function solve(input: P022Input): Promise<P022Output> {
  const n = input.targets.length;
  const m = new Model("L1Deviation");

  const allocations = input.upperBounds.map((ub, i) =>
    m.continuous(`x_${i}`, { lb: 0, ub })
  );
  const dPlus = m.continuous(n, { lb: 0, prefix: "dp" });
  const dMinus = m.continuous(n, { lb: 0, prefix: "dm" });

  m.constraint(expr`${sum(allocations)} == ${input.totalOutput}`, "total_output");
  m.constraint(expr`dot(${input.costs}, ${allocations}) <= ${input.budget}`, "budget");
  m.constraint(
    input.targets.map(
      (target, i) => expr`${allocations[i]} - ${target} == ${dPlus[i]} - ${dMinus[i]}`
    )
  );

  m.objective(
    minimize(expr`dot(${input.weights}, ${dPlus}) + dot(${input.weights}, ${dMinus})`)
  );
  await m.solve();

  return {
    allocations: allocations.map((v) => v.value!),
    totalDeviation: m.objectiveValue!,
  };
}
