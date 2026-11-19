import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P010Input {
  baseMargins: number[];
  candidateMargins: number[];
  usages: number[][];
  capacities: number[];
}

export async function solve(input: P010Input) {
  const m = new Model("ReducedCostPricing");

  // TODO: Jointly optimize base + candidate products, extract shadowPrices (c.dual),
  // compute candidate reduced costs (v.reducedCost) and break-even margin increases,
  // and return { baseQuantities, candidateQuantities, optimalProfit, shadowPrices, candidateReducedCosts, minMarginIncreaseNeeded }.
  throw new Error("Not implemented");
}
