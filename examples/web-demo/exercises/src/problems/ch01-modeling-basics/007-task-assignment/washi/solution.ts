import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P007Input {
  costs: number[][];
}

export interface P007Output {
  assignment: number[];
  totalCost: number;
}

export async function solve(input: P007Input): Promise<P007Output> {
  const m = new Model("TaskAssignment");

  // Decision variables: binary x[i][j] = 1 if worker i is assigned to task j.
  const x = input.costs.map((row, i) =>
    row.map((_, j) => m.binary(`x_${i}_${j}`))
  );

  // Assignment constraints: each worker gets exactly one task, and each task gets exactly one worker.
  m.constraint(x.map((row) => expr`${sum(row)} == 1`));
  m.constraint(x.map((_, j) => expr`${sum(x.map((row) => row[j]))} == 1`));

  // Objective: minimize total assignment cost.
  const totalExpr = sum(
    x.flatMap((row, i) => row.map((cell, j) => expr`${input.costs[i][j]} * ${cell}`))
  );
  m.objective(minimize(totalExpr));
  await m.solve();

  // Round before comparing to 1 to guard against floating-point tolerances (e.g., 0.999999999).
  return {
    assignment: x.map((row) => row.findIndex((cell) => Math.round(cell.value!) === 1)),
    totalCost: m.objectiveValue!,
  };
}
