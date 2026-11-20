import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P085Input {
  baseline: number[][];
  unavailable: number[][];
  demands: number[];
  maxShifts: number[];
  workerCosts: number[];
  disruptionWeight: number;
}

export interface P085Output {
  schedule: number[][];
  hammingDistance: number;
  totalObjective: number;
}

export async function solve(input: P085Input): Promise<P085Output> {
  const m = new Model("MinDisruptionRescheduling");

  const x = input.baseline.map((row, i) =>
    row.map((_, t) => m.binary(`x_${i}_${t}`))
  );

  m.constraint(
    x.flatMap((row, i) =>
      row
        .filter((_, t) => input.unavailable[i][t] === 1)
        .map((v) => expr`${v} == 0`)
    )
  );
  m.constraint(
    x.map((row, i) => expr`${sum(row)} <= ${input.maxShifts[i]}`)
  );
  m.constraint(
    input.demands.map(
      (demand, t) => expr`${sum(x.map((row) => row[t]))} == ${demand}`
    )
  );

  const hammingExpr = sum(
    x.flatMap((row, i) =>
      row.map((v, t) => {
        const b = input.baseline[i][t];
        return expr`(1 - ${b}) * ${v} + ${b} * (1 - ${v})`;
      })
    )
  );
  const assignCostExpr = sum(
    x.map((row, i) => expr`${input.workerCosts[i]} * ${sum(row)}`)
  );

  m.objective(minimize(expr`${input.disruptionWeight} * ${hammingExpr} + ${assignCostExpr}`));
  await m.solve();

  const schedule = x.map((row) => row.map((v) => Math.round(v.value!) || 0));
  const hammingDistance = schedule.reduce(
    (acc, row, i) =>
      acc + row.reduce((s, bit, t) => s + (bit !== input.baseline[i][t] ? 1 : 0), 0),
    0
  );

  return {
    schedule,
    hammingDistance,
    totalObjective: m.objectiveValue!,
  };
}
