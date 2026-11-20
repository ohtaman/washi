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
  const m = new Model("SupplierAllocationCaps");

  // TODO:
  // 1. Declare binary active[s] and continuous allocations[s][p] bounded by [0, maxShare * demands[p]]
  // 2. Enforce active-supplier count bounds [minSuppliers, maxSuppliers]
  // 3. Enforce semi-continuous total order bounds minOrders[s]*active[s] <= sum_p allocations[s][p] <= maxOrders[s]*active[s]
  // 4. Meet all plant demands, minimize fixed + unit procurement cost, await m.solve(), and return outputs
  throw new Error("Not implemented");
}
