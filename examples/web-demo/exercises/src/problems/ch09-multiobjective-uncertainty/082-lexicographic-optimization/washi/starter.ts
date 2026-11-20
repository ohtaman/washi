import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P082Input {
  coverage: number[];
  crews: number[];
  opCosts: number[];
  maxCrews: number;
  targetDemand: number;
  slack: number;
}

export interface P082Output {
  selected: number[];
  obj1: number;
  obj2: number;
}

export async function solve(input: P082Input): Promise<P082Output> {
  const n = input.coverage.length;

  // Stage 1: minimize primary unmet demand shortfall
  const m1 = new Model("LexicographicStage1");
  const x1 = m1.binary(n, { prefix: "x" });
  const shortfall1 = m1.continuous("shortfall", { lb: 0 });

  // TODO:
  // 1. Add Stage 1 constraints: dot(crews, x1) <= maxCrews and dot(coverage, x1) + shortfall1 >= targetDemand
  // 2. Minimize shortfall1, solve m1, and record bestObj1 = m1.objectiveValue!
  // 3. Build Stage 2 model m2 minimizing dot(opCosts, x2) subject to dot(crews, x2) <= maxCrews
  //    and dot(coverage, x2) >= targetDemand - (bestObj1 + slack)
  // 4. Solve m2 and return { selected, obj1: Math.max(0, targetDemand - covered), obj2: m2.objectiveValue! }
  throw new Error("Not implemented");
}
