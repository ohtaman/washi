import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P007Input {
  costs: number[][];
}

export async function solve(input: P007Input) {
  const n = input.costs.length;
  const m = new Model("TaskAssignment");

  const x = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => m.binary(`x_${i}_${j}`))
  );

  for (let i = 0; i < n; i++) {
    m.constraint(expr`${sum(x[i])} == 1`, `worker_${i}`);
  }
  for (let j = 0; j < n; j++) {
    const col = x.map((row) => row[j]);
    m.constraint(expr`${sum(col)} == 1`, `task_${j}`);
  }

  const totalExpr = sum(
    x.flatMap((row, i) => row.map((cell, j) => expr`${input.costs[i][j]} * ${cell}`))
  );
  m.objective(minimize(totalExpr));

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  const assignment = x.map((row) =>
    row.findIndex((cell) => Math.round(cell.value!) === 1)
  );

  return {
    assignment,
    totalCost: m.objectiveValue!,
  };
}
