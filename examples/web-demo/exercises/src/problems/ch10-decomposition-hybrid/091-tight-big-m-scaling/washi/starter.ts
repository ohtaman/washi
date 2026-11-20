import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P091Input {
  fixedCosts: number[];
  unitCosts: number[];
  capacities: number[];
  demand: number;
}

export interface P091Output {
  open: number[];
  quantities: number[];
  totalCost: number;
  lpBound: number;
}

export async function solve(input: P091Input): Promise<P091Output> {
  const n = input.fixedCosts.length;
  const m = new Model("TightBigMProduction");

  const open = m.binary(n, { prefix: "open" });
  const quantities = input.capacities.map((cap, i) =>
    m.continuous(`qty_${i}`, { lb: 0, ub: Math.min(cap, input.demand) })
  );

  // TODO:
  // 1. Link each production variable using tight instance-derived Big-M:
  //    M_i = Math.min(input.capacities[i], input.demand)
  //    quantities[i] <= M_i * open[i]
  // 2. Enforce total production sum(quantities) >= input.demand
  // 3. Minimize dot(input.fixedCosts, open) + dot(input.unitCosts, quantities)
  // 4. Call await m.relax() to record lpBound = m.objectiveValue!,
  //    then call await m.solve() for the integer solution, and return
  //    { open, quantities, totalCost, lpBound }
  throw new Error("Not implemented");
}
