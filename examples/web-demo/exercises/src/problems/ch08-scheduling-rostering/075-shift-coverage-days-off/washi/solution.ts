import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P075Input {
  demands: number[][];
  shiftCosts: number[][];
  minShifts: number[];
  maxShifts: number[];
  daysOff: number[][];
}

export interface P075Output {
  schedule: number[][];
  totalCost: number;
}

export async function solve(input: P075Input): Promise<P075Output> {
  const N = input.shiftCosts.length;
  const D = input.demands.length;
  const S = input.demands[0].length;
  const m = new Model("ShiftCoverageDaysOff");

  const x = Array.from({ length: N }, (_, i) =>
    Array.from({ length: D }, (_, d) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${i}_${d}_${s}`))
    )
  );

  x.forEach((staffDays, i) => {
    const offSet = new Set(input.daysOff[i]);
    staffDays.forEach((dayVars, d) => {
      m.constraint(
        offSet.has(d) ? expr`${sum(dayVars)} == 0` : expr`${sum(dayVars)} <= 1`
      );
    });
    const totalWorked = sum(staffDays.flat());
    m.constraint([
      expr`${totalWorked} >= ${input.minShifts[i]}`,
      expr`${totalWorked} <= ${input.maxShifts[i]}`,
    ]);
  });

  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      m.constraint(
        expr`${sum(x.map((staff) => staff[d][s]))} >= ${input.demands[d][s]}`
      );
    }
  }

  m.objective(
    minimize(
      sum(
        x.flatMap((staffDays, i) =>
          staffDays.flatMap((dayVars) =>
            dayVars.map((v, s) => expr`${input.shiftCosts[i][s]} * ${v}`)
          )
        )
      )
    )
  );
  await m.solve();

  return {
    schedule: x.map((staffDays) =>
      staffDays.map((dayVars) =>
        dayVars.findIndex((v) => Math.round(v.value!) === 1)
      )
    ),
    totalCost: m.objectiveValue!,
  };
}
