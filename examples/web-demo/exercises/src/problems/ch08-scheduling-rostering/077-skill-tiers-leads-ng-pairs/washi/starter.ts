import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P077Input {
  demands: number[][];
  isSenior: number[];
  staffSkills: number[][];
  skillDemands: number[][];
  ngPairs: number[][];
  shiftCosts: number[][];
}

export interface P077Output {
  schedule: number[][];
  totalCost: number;
}

export async function solve(input: P077Input): Promise<P077Output> {
  const N = input.shiftCosts.length;
  const D = input.demands.length;
  const S = input.demands[0].length;
  const m = new Model("SkillTiersLeadsNgPairs");

  const x = Array.from({ length: N }, (_, i) =>
    Array.from({ length: D }, (_, d) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${i}_${d}_${s}`))
    )
  );

  // TODO:
  // 1. Enforce max 1 shift per staff-day
  // 2. For every (d, s) with demands[d][s] > 0: total headcount >= demands[d][s], >= 1 senior lead, and >= skillDemands[s][k] for every skill k
  // 3. For every NG pair [a, b] and (d, s): x[a][d][s] + x[b][d][s] <= 1
  // 4. Minimize total shiftCosts, solve, and decode schedule[i][d] (-1 for Off, 0..S-1 for shift)
  throw new Error("Not implemented");
}
