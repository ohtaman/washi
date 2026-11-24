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

  // Decision variables for disjunctive convex hull:
  // binary y[i][k] selects operating band k for unit i; continuous x[i][k] is the disaggregated output in band k.
  const y = input.bandLbs.map((row, i) =>
    row.map((_, k) => m.binary(`y_${i}_${k}`))
  );
  const x = input.bandUbs.map((row, i) =>
    row.map((ub, k) => m.continuous(`x_${i}_${k}`, { lb: 0, ub }))
  );

  // Each unit i must operate in exactly one band k.
  m.constraint(y.map((row) => expr`${sum(row)} == 1`));
  // Disjunctive convex-hull bounds: x[i][k] is 0 if y[i][k]=0, or in [bandLbs, bandUbs] if y[i][k]=1.
  m.constraint(
    input.bandLbs.flatMap((lbs, i) =>
      lbs.flatMap((lb, k) => [
        expr`${x[i][k]} >= ${lb} * ${y[i][k]}`,
        expr`${x[i][k]} <= ${input.bandUbs[i][k]} * ${y[i][k]}`,
      ])
    )
  );
  // Total output across all units and bands must meet demand.
  m.constraint(expr`${sum(x.flat())} >= ${input.demand}`, "demand");

  // Objective: minimize total fixed mode costs plus variable unit costs.
  const totalCostExpr = sum(
    input.fixedCosts.flatMap((fRow, i) =>
      fRow.map(
        (fc, k) => expr`${fc} * ${y[i][k]} + ${input.unitCosts[i][k]} * ${x[i][k]}`
      )
    )
  );
  m.objective(minimize(totalCostExpr));
  await m.solve();

  // Round y before comparing to 1 to guard against floating-point tolerances; sum x[i][k] to recover unit i's output.
  return {
    modes: y.map((row) => row.findIndex((v) => Math.round(v.value!) === 1)),
    outputs: x.map((row) => row.reduce((acc, v) => acc + v.value!, 0)),
    totalCost: m.objectiveValue!,
  };
}
