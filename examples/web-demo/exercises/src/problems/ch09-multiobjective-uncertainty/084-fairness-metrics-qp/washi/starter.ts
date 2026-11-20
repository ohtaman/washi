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
  const mean = input.totalDemand / n;
  const m = new Model("FairnessQP");

  const x = input.minAlloc.map((lb, i) =>
    m.continuous({ lb, ub: input.maxAlloc[i], name: `x_${i}` })
  );

  // TODO:
  // 1. Add total demand conservation constraint: sum(x) == totalDemand
  // 2. Minimize convex QP objective: dot(unitCosts, x) + fairnessWeight * sum((x - mean)^2)
  // 3. Solve with HiGHS and return { allocations, totalCost }
  throw new Error("Not implemented");
}
