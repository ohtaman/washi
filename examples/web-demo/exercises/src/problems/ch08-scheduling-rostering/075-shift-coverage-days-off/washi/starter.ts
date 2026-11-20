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

  // TODO:
  // 1. Enforce max 1 shift per staff-day, and 0 shifts on required daysOff[i]
  // 2. Enforce daily shift coverage: sum_i x[i][d][s] >= demands[d][s]
  // 3. Enforce per-staff minShifts[i] <= sum_{d,s} x[i][d][s] <= maxShifts[i]
  // 4. Minimize total shiftCosts, solve, and decode schedule[i][d] (-1 for Off, 0..S-1 for shift)
  throw new Error("Not implemented");
}
