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

  // setups[t] = 1 if production occurs in period t (binary)
  const setups = m.binary(T, { prefix: "y" });
  // Facility-location disaggregation: w[t][k - t] = units produced in period t to satisfy demand in period k >= t (>= 0)
  const w = input.demands.map((_, t) =>
    Array.from({ length: T - t }, (__, offset) =>
      m.continuous(`w_${t}_${t + offset}`, { lb: 0 })
    )
  );

  // Demand satisfaction: sum of shipments from periods t <= k meets period k demand
  m.constraint(
    input.demands.map((demand, k) =>
      expr`${sum(Array.from({ length: k + 1 }, (_, t) => w[t][k - t]))} == ${demand}`
    )
  );

  // Strong variable-upper-bound (VUB) disaggregation: w_{t,k} <= d_k * y_t tightens LP relaxation
  m.constraint(
    w.flatMap((row, t) =>
      row.map((v, offset) => expr`${v} <= ${input.demands[t + offset]} * ${setups[t]}`)
    )
  );

  // Period capacity constraint: total production in period t cannot exceed C_t * y_t
  m.constraint(
    w.map((row, t) => expr`${sum(row)} <= ${input.capacities[t]} * ${setups[t]}`)
  );

  // Precompute cumulative holding cost from production period t to demand period k: c_t + sum_{tau=t}^{k-1} h_tau
  const flowCostTerms = w.flatMap((row, t) =>
    row.map((v, offset) => {
      const k = t + offset;
      let holdSum = 0;
      for (let tau = t; tau < k; tau++) holdSum += input.holdCosts[tau];
      const coeff = input.prodCosts[t] + holdSum;
      return expr`${coeff} * ${v}`;
    })
  );

  // Objective: minimize total setup, production, and holding costs
  m.objective(
    minimize(expr`dot(${input.setupCosts}, ${setups}) + ${sum(flowCostTerms)}`)
  );
  await m.solve();

  // Reconstruct total production per period t and ending inventory (stock produced at tau <= t for k > t)
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
    // Round binary values to strip solver tolerance noise (e.g. -0 or 1e-9)
    setups: setups.map((v) => Math.round(v.value!) || 0),
    production,
    inventory,
    totalCost: m.objectiveValue!,
  };
}
