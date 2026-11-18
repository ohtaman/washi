import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P003Input {
  baseRevenue: number;
  baseCost: number;
  revenues: number[];
  costs: number[];
  capacities: number[];
  minTotal: number;
  maxTotal: number;
  greenIndex: number;
  minGreenShare: number;
}

export async function solve(input: P003Input) {
  const n = input.revenues.length;
  const m = new Model("CharnesCooper");

  // Homogenized variables: t = 1 / denominator, y[i] = t * quantities[i]
  const t = m.continuous({ lb: 0, name: "t" });
  const y = m.continuous(n, { lb: 0, prefix: "y" });

  // TODO:
  // 1. Add denominator normalization constraint == 1
  // 2. Scale capacities, minTotal, maxTotal, and greenShare constraints by t
  // 3. Maximize baseRevenue * t + dot(revenues, y), solve, and recover quantities[i] = y[i] / t
  throw new Error("Not implemented");
}
