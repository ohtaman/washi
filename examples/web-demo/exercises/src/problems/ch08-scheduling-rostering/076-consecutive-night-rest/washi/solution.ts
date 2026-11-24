import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P076Input {
  demands: number[][];
  shiftCosts: number[][];
  maxConsecutiveDays: number;
}

export interface P076Output {
  schedule: number[][];
  totalCost: number;
}

export async function solve(input: P076Input): Promise<P076Output> {
  const N = input.shiftCosts.length;
  const D = input.demands.length;
  const S = 3;
  const K = input.maxConsecutiveDays;
  const m = new Model("ConsecutiveNightRest");

  // x[i][d][s] = 1 if staff i works shift s (0: early, 1: late, 2: night) on day d (binary)
  const x = Array.from({ length: N }, (_, i) =>
    Array.from({ length: D }, (_, d) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${i}_${d}_${s}`))
    )
  );

  x.forEach((staffDays) => {
    // At most 1 shift per day per staff member
    const work = staffDays.map((dayVars) => sum(dayVars));
    m.constraint(work.map((w) => expr`${w} <= 1`));

    // Sliding window of length K + 1: at most K working days in any K + 1 consecutive days
    for (let t = 0; t <= D - K - 1; t++) {
      m.constraint(expr`${sum(work.slice(t, t + K + 1))} <= ${K}`);
    }
    // Night-to-early rest rule: forbid night shift (s = 2) on day d followed by early shift (s = 0) on day d + 1
    for (let d = 0; d < D - 1; d++) {
      m.constraint(expr`${staffDays[d][2]} + ${staffDays[d + 1][0]} <= 1`);
    }
  });

  // Shift coverage: meet demand for every (day, shift)
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
    // Decode assigned shift index per (staff, day); -1 if off (rounded for tolerance safety)
    schedule: x.map((staffDays) =>
      staffDays.map((dayVars) =>
        dayVars.findIndex((v) => Math.round(v.value!) === 1)
      )
    ),
    totalCost: m.objectiveValue!,
  };
}
