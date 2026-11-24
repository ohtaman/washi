import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P067Input {
  demands: number[];
  unitCosts: number[][];
  fixedCosts: number[];
  minOrders: number[];
  maxOrders: number[];
  maxShare: number;
  minSuppliers: number;
  maxSuppliers: number;
}

export interface P067Output {
  active: number[];
  allocations: number[][];
  totalCost: number;
}

export async function solve(input: P067Input): Promise<P067Output> {
  const nSup = input.fixedCosts.length;
  const m = new Model("SupplierAllocationCaps");

  // active[s] = 1 if supplier s is selected (binary)
  const active = m.binary(nSup, { prefix: "y" });
  // allocations[s][p]: order quantity from supplier s to plant p, capped by maxShare * demand[p] (dual-sourcing cap)
  const allocations = input.fixedCosts.map((_, s) =>
    input.demands.map((demand, p) =>
      m.continuous(`q_${s}_${p}`, { lb: 0, ub: input.maxShare * demand })
    )
  );

  // Active supplier cardinality bounds (min/max number of selected suppliers)
  m.constraint(expr`${sum(active)} >= ${input.minSuppliers}`);
  m.constraint(expr`${sum(active)} <= ${input.maxSuppliers}`);

  // Semi-continuous supplier order bounds: total order is 0 if inactive, or in [minOrders[s], maxOrders[s]] if active
  allocations.forEach((row, s) => {
    const totalOrder = sum(row);
    m.constraint(expr`${totalOrder} >= ${input.minOrders[s]} * ${active[s]}`);
    m.constraint(expr`${totalOrder} <= ${input.maxOrders[s]} * ${active[s]}`);
  });

  // Plant demand satisfaction
  m.constraint(
    input.demands.map(
      (demand, p) => expr`${sum(allocations.map((row) => row[p]))} >= ${demand}`
    )
  );

  // Objective: minimize fixed supplier engagement costs plus variable procurement costs
  const varCost = sum(
    allocations.flatMap((row, s) =>
      row.map((q, p) => expr`${input.unitCosts[s][p]} * ${q}`)
    )
  );
  m.objective(minimize(expr`dot(${input.fixedCosts}, ${active}) + ${varCost}`));
  await m.solve();

  return {
    // Round binary flags to strip solver tolerance noise
    active: active.map((v) => Math.round(v.value!) || 0),
    allocations: allocations.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
