import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P061Input {
  demands: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCosts: number[];
  capacities: number[];
}

export interface P061Output {
  setups: number[];
  production: number[];
  inventory: number[];
  totalCost: number;
}

export async function solve(input: P061Input): Promise<P061Output> {
  const T = input.demands.length;
  const m = new Model("SingleItemLotSizingFL");

  const setups = m.binary(T, { prefix: "y" });
  // Facility-location disaggregation: w[t][k - t] = units produced in t for demand in k >= t
  const w = input.demands.map((_, t) =>
    Array.from({ length: T - t }, (__, offset) =>
      m.continuous(`w_${t}_${t + offset}`, { lb: 0 })
    )
  );

  // Demand satisfaction for each period k
  m.constraint(
    input.demands.map((demand, k) =>
      expr`${sum(Array.from({ length: k + 1 }, (_, t) => w[t][k - t]))} == ${demand}`
    )
  );

  // Strong variable-upper-bound disaggregation: w_{t,k} <= d_k * y_t
  m.constraint(
    w.flatMap((row, t) =>
      row.map((v, offset) => expr`${v} <= ${input.demands[t + offset]} * ${setups[t]}`)
    )
  );

  // Period capacity constraint: sum_{k >= t} w_{t,k} <= C_t * y_t
  m.constraint(
    w.map((row, t) => expr`${sum(row)} <= ${input.capacities[t]} * ${setups[t]}`)
  );

  const flowCostTerms = w.flatMap((row, t) =>
    row.map((v, offset) => {
      const k = t + offset;
      let holdSum = 0;
      for (let tau = t; tau < k; tau++) holdSum += input.holdCosts[tau];
      const coeff = input.prodCosts[t] + holdSum;
      return expr`${coeff} * ${v}`;
    })
  );

  m.objective(
    minimize(expr`dot(${input.setupCosts}, ${setups}) + ${sum(flowCostTerms)}`)
  );
  await m.solve();

  const production = w.map((row) =>
    row.reduce((acc, v) => acc + v.value!, 0)
  );
  const inventory = input.demands.map((_, t) => {
    let total = 0;
    for (let tau = 0; tau <= t; tau++) {
      for (let k = t + 1; k < T; k++) {
        total += w[tau][k - tau].value!;
      }
    }
    return total;
  });

  return {
    setups: setups.map((v) => Math.round(v.value!) || 0),
    production,
    inventory,
    totalCost: m.objectiveValue!,
  };
}
