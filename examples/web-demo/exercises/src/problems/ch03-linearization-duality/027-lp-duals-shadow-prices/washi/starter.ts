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

  const quantities = input.capacities.map((cap, i) =>
    m.continuous(`x_${i}`, { lb: 0, ub: cap })
  );

  // TODO:
  // 1. Add >= constraints for input.minRequirements and keep the returned Constraint references:
  //    dot(input.yields[k], quantities) >= input.minRequirements[k]
  // 2. Add <= constraints for input.maxResources and keep the returned Constraint references:
  //    dot(input.resourceUsages[l], quantities) <= input.maxResources[l]
  // 3. Minimize dot(input.costs, quantities), await m.solve(),
  //    and read c.dual! in order [...reqConstrs, ...capConstrs]
  throw new Error("Not implemented");
}
