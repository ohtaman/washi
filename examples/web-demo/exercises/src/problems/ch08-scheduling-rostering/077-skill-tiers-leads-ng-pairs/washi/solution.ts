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

  const x = Array.from({ length: N }, (_, i) =>
    Array.from({ length: D }, (_, d) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${i}_${d}_${s}`))
    )
  );

  x.forEach((staffDays) => {
    m.constraint(staffDays.map((dayVars) => expr`${sum(dayVars)} <= 1`));
  });

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

  for (const [a, b] of input.ngPairs) {
    for (let d = 0; d < D; d++) {
      for (let s = 0; s < S; s++) {
        m.constraint(expr`${x[a][d][s]} + ${x[b][d][s]} <= 1`);
      }
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
