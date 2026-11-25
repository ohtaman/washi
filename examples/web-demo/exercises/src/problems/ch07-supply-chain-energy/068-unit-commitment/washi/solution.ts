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

  // u[g][t]: commitment status (1 = on), v[g][t]: startup (1 = turned on at t)
  const u = m.binary(G, T, { prefix: "u" });
  const v = m.binary(G, T, { prefix: "v" });
  // w[g][t]: shutdown indicator in [0, 1]; forced integral by v - w = u_t - u_{t-1} and clique cuts
  const w = m.continuous(G, T, { lb: 0, ub: 1, prefix: "w" });
  // p[g][t]: power output of generator g in period t (0 <= p <= pMax[g])
  const p = input.pMax.map((ub, g) =>
    Array.from({ length: T }, (_, t) => m.continuous(`p_${g}_${t}`, { lb: 0, ub }))
  );

  // Hourly power balance: total generation meets demand in each period t
  m.constraint(
    input.demands.map(
      (demand, t) => expr`${sum(p.map((row) => row[t]))} == ${demand}`
    )
  );

  for (let g = 0; g < G; g++) {
    // Startup/shutdown capability allows jumping directly to max(pMin, rampLimit)
    const startCap = Math.max(input.pMin[g], input.rampLimit[g]);
    for (let t = 0; t < T; t++) {
      // Generation bounds when unit is committed
      m.constraint(expr`${p[g][t]} >= ${input.pMin[g]} * ${u[g][t]}`);
      m.constraint(expr`${p[g][t]} <= ${input.pMax[g]} * ${u[g][t]}`);

      // Startup / shutdown state transition (units start off at t = 0)
      const prevU = t === 0 ? 0 : u[g][t - 1];
      m.constraint(expr`${v[g][t]} - ${w[g][t]} - ${u[g][t]} + ${prevU} == 0`);

      // Minimum up time (turn-on clique inequality: at most one startup in window, forces u[g][t] = 1)
      const upStart = Math.max(0, t - input.minUp[g] + 1);
      m.constraint(
        expr`${sum(v[g].slice(upStart, t + 1))} <= ${u[g][t]}`
      );

      // Minimum down time (turn-off clique inequality: if shut down in window, u[g][t] must remain 0)
      const downStart = Math.max(0, t - input.minDown[g] + 1);
      m.constraint(
        expr`${sum(w[g].slice(downStart, t + 1))} + ${u[g][t]} <= 1`
      );

      // Ramp-up & ramp-down limits (relaxed to startCap when unit is starting up or shutting down)
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

  // Objective: minimize total startup costs and linear fuel costs
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
    // Round binary commitment flags to strip solver tolerance noise
    commitment: u.map((row) => row.map((val) => Math.round(val.value!) || 0)),
    generation: p.map((row) => row.map((val) => val.value!)),
    totalCost: m.objectiveValue!,
  };
}
