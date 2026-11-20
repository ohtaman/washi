import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P029Input {
  demand: number;
  bandLbs: number[][];
  bandUbs: number[][];
  fixedCosts: number[][];
  unitCosts: number[][];
}

export interface P029Output {
  modes: number[];
  outputs: number[];
  totalCost: number;
}

export async function solve(input: P029Input): Promise<P029Output> {
  const m = new Model("DisjunctiveConvexHull");

  const y = input.bandLbs.map((row, i) =>
    row.map((_, k) => m.binary(`y_${i}_${k}`))
  );
  const x = input.bandUbs.map((row, i) =>
    row.map((ub, k) => m.continuous(`x_${i}_${k}`, { lb: 0, ub }))
  );

  // TODO:
  // 1. Choose exactly one operating band per unit i: sum(y[i]) == 1
  // 2. Enforce disaggregated convex-hull bounds for every (i, k):
  //    bandLbs[i][k] * y[i][k] <= x[i][k] <= bandUbs[i][k] * y[i][k]
  // 3. Enforce total output across all disaggregated variables >= input.demand
  // 4. Minimize sum_{i,k} (fixedCosts[i][k] * y[i][k] + unitCosts[i][k] * x[i][k]),
  //    solve, and return { modes, outputs, totalCost }
  throw new Error("Not implemented");
}
