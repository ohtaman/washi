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

  // x[i][d][s] = 1 if staff i works shift s on day d (binary)
  const x = Array.from({ length: N }, (_, i) =>
    Array.from({ length: D }, (_, d) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${i}_${d}_${s}`))
    )
  );

  // Per-staff constraints: requested days off (0 shifts), at most 1 shift per working day, and total shift bounds
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

  // Shift coverage: enough staff assigned to meet demand on every (day, shift)
  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      m.constraint(
        expr`${sum(x.map((staff) => staff[d][s]))} >= ${input.demands[d][s]}`
      );
    }
  }

  // Objective: minimize total shift assignment costs
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
    // Decode assigned shift index per (staff, day); findIndex returns -1 for day off (rounded for tolerance safety)
    schedule: x.map((staffDays) =>
      staffDays.map((dayVars) =>
        dayVars.findIndex((v) => Math.round(v.value!) === 1)
      )
    ),
    totalCost: m.objectiveValue!,
  };
}
