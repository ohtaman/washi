import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P068Input {
  demands: number[];
  pMin: number[];
  pMax: number[];
  rampLimit: number[];
  minUp: number[];
  minDown: number[];
  startupCosts: number[];
  fuelCosts: number[];
}

export interface P068Output {
  commitment: number[][];
  generation: number[][];
  totalCost: number;
}

export async function solve(input: P068Input): Promise<P068Output> {
  const G = input.pMin.length;
  const T = input.demands.length;
  const m = new Model("UnitCommitment");

  const u = m.binary(G, T, { prefix: "u" });
  const v = m.binary(G, T, { prefix: "v" });
  const w = m.continuous(G, T, { lb: 0, ub: 1, prefix: "w" });
  const p = input.pMax.map((ub, g) =>
    Array.from({ length: T }, (_, t) => m.continuous(`p_${g}_${t}`, { lb: 0, ub }))
  );

  // Hourly power balance
  m.constraint(
    input.demands.map(
      (demand, t) => expr`${sum(p.map((row) => row[t]))} == ${demand}`
    )
  );

  for (let g = 0; g < G; g++) {
    const startCap = Math.max(input.pMin[g], input.rampLimit[g]);
    for (let t = 0; t < T; t++) {
      // Generation bounds
      m.constraint(expr`${p[g][t]} >= ${input.pMin[g]} * ${u[g][t]}`);
      m.constraint(expr`${p[g][t]} <= ${input.pMax[g]} * ${u[g][t]}`);

      // Startup / shutdown state transition
      const prevU = t === 0 ? 0 : u[g][t - 1];
      m.constraint(expr`${v[g][t]} - ${w[g][t]} - ${u[g][t]} + ${prevU} == 0`);

      // Minimum up time (turn-on clique inequality)
      const upStart = Math.max(0, t - input.minUp[g] + 1);
      m.constraint(
        expr`${sum(v[g].slice(upStart, t + 1))} <= ${u[g][t]}`
      );

      // Minimum down time (turn-off clique inequality)
      const downStart = Math.max(0, t - input.minDown[g] + 1);
      m.constraint(
        expr`${sum(w[g].slice(downStart, t + 1))} + ${u[g][t]} <= 1`
      );

      // Ramp-up & ramp-down limits (with startup/shutdown capability startCap)
      if (t === 0) {
        m.constraint(expr`${p[g][0]} <= ${startCap}`);
      } else {
        const diff = startCap - input.rampLimit[g];
        m.constraint(
          expr`${p[g][t]} - ${p[g][t - 1]} + ${diff} * ${u[g][t - 1]} <= ${startCap}`
        );
        m.constraint(
          expr`${p[g][t - 1]} - ${p[g][t]} + ${diff} * ${u[g][t]} <= ${startCap}`
        );
      }
    }
  }

  const totalCostExpr = sum(
    u.flatMap((row, g) =>
      row.map(
        (_, t) =>
          expr`${input.startupCosts[g]} * ${v[g][t]} + ${input.fuelCosts[g]} * ${p[g][t]}`
      )
    )
  );
  m.objective(minimize(totalCostExpr));
  await m.solve();

  return {
    commitment: u.map((row) => row.map((val) => Math.round(val.value!) || 0)),
    generation: p.map((row) => row.map((val) => val.value!)),
    totalCost: m.objectiveValue!,
  };
}
