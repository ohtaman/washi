import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

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
  const K = input.staffSkills[0].length;
  const m = new Model("SkillTiersLeadsNgPairs");

  // x[i][d][s] = 1 if staff i works shift s on day d (binary)
  const x = Array.from({ length: N }, (_, i) =>
    Array.from({ length: D }, (_, d) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${i}_${d}_${s}`))
    )
  );

  // At most 1 shift per day per staff member
  x.forEach((staffDays) => {
    m.constraint(staffDays.map((dayVars) => expr`${sum(dayVars)} <= 1`));
  });

  // Active shift coverage: headcount, at least 1 senior lead, and per-skill quotas
  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      if (input.demands[d][s] <= 0) continue;
      const col = x.map((staff) => staff[d][s]);
      m.constraint([
        expr`${sum(col)} >= ${input.demands[d][s]}`,
        expr`dot(${input.isSenior}, ${col}) >= 1`,
      ]);
      for (let k = 0; k < K; k++) {
        if (input.skillDemands[s][k] > 0) {
          const coeffs = input.staffSkills.map((sk) => sk[k]);
          m.constraint(expr`dot(${coeffs}, ${col}) >= ${input.skillDemands[s][k]}`);
        }
      }
    }
  }

  // Incompatible (NG) staff pairs cannot be assigned to the same (day, shift)
  for (const [a, b] of input.ngPairs) {
    for (let d = 0; d < D; d++) {
      for (let s = 0; s < S; s++) {
        m.constraint(expr`${x[a][d][s]} + ${x[b][d][s]} <= 1`);
      }
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
