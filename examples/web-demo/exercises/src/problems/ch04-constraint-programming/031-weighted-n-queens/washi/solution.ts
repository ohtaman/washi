import { Model, at, distinct, expr, minimize, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P031Input {
  costMatrix: number[][];
}

export interface P031Output {
  cols: number[];
  totalCost: number;
}

export async function solve(input: P031Input): Promise<P031Output> {
  const n = input.costMatrix.length;
  const m = new Model("WeightedNQueens");

  const cols = m.integer(n, {
    lb: 0,
    ub: n - 1,
    prefix: "col",
  });

  m.constraint(distinct(cols), "distinct_cols");
  m.constraint(
    distinct(cols.map((c, r) => expr`${c} + ${r}`)),
    "distinct_diag_pos"
  );
  m.constraint(
    distinct(cols.map((c, r) => expr`${c} - ${r}`)),
    "distinct_diag_neg"
  );

  m.objective(minimize(sum(input.costMatrix.map((row, r) => at(row, cols[r])))));
  await m.solve({ solver: "pumpkin" });

  return {
    cols: cols.map((v) => Math.round(v.value!) || 0),
    totalCost: Math.round(m.objectiveValue!) || 0,
  };
}
