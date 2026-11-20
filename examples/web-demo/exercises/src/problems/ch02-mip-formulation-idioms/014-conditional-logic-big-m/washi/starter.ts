import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P014Input {
  budget: number;
  unitReturns: number[];
  fixedCosts: number[];
  minLevels: number[];
  maxLevels: number[];
  prerequisites: number[][];
  conjunctions: number[][];
  conflicts: number[][];
}

export interface P014Output {
  active: number[];
  levels: number[];
  netProfit: number;
}

export async function solve(input: P014Input): Promise<P014Output> {
  const n = input.unitReturns.length;
  const m = new Model("ConditionalLogicBigM");

  const active = m.binary(n, { prefix: "act" });
  const levels = m.continuous(n, { lb: 0, prefix: "lvl" });

  // TODO:
  // 1. Link continuous allocation ranges: minLevels[i] * active[i] <= levels[i] <= maxLevels[i] * active[i]
  // 2. Enforce total budget: sum(levels) <= input.budget
  // 3. Linearize prerequisites (active[a] <= active[b]), conjunctions (active[a] + active[b] - 1 <= active[c]),
  //    and conflicts (active[u] + active[v] <= 1)
  // 4. Maximize dot(unitReturns, levels) - dot(fixedCosts, active), solve, and return result
  throw new Error("Not implemented");
}
