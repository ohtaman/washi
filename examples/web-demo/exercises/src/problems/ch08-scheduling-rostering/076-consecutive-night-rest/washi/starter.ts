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
  const S = 3; // 0: Day, 1: Evening, 2: Night
  const K = input.maxConsecutiveDays;
  const m = new Model("ConsecutiveNightRest");

  const x = Array.from({ length: N }, (_, i) =>
    Array.from({ length: D }, (_, d) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${i}_${d}_${s}`))
    )
  );

  // TODO:
  // 1. Enforce max 1 shift per staff-day and daily shift coverage >= demands[d][s]
  // 2. Enforce rolling window max consecutive workdays: sum_{tau=t}^{t+K} work[i][tau] <= K
  // 3. Forbid Night (2) -> Day (0) transition: x[i][d][2] + x[i][d+1][0] <= 1
  // 4. Minimize total shiftCosts, solve, and decode schedule[i][d] (-1 for Off, 0/1/2 for shift)
  throw new Error("Not implemented");
}
