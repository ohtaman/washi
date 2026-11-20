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

  // TODO:
  // 1. Add total output equality: sum(allocations) == input.totalOutput
  // 2. Add budget constraint: dot(input.costs, allocations) <= input.budget
  // 3. Split each deviation: allocations[i] - input.targets[i] == dPlus[i] - dMinus[i]
  // 4. Minimize dot(input.weights, dPlus) + dot(input.weights, dMinus), solve,
  //    and return { allocations, totalDeviation }
  throw new Error("Not implemented");
}
