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

  const quantities = m.continuous(n, { lb: 0, prefix: "x" });

  // TODO:
  // 1. Add >= constraints for each requirement: dot(input.yields[k], quantities) >= input.minRequirements[k]
  // 2. Minimize dot(input.costs, quantities) and await m.solve()
  // 3. Return { quantities: v.value!, reducedCosts: v.reducedCost!, optimalCost: m.objectiveValue! }
  throw new Error("Not implemented");
}
