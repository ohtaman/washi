import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P062Input {
  demands: number[][];
  setupCosts: number[];
  holdCosts: number[];
  unitTimes: number[];
  setupTimes: number[];
  capacities: number[];
}

export interface P062Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export async function solve(input: P062Input): Promise<P062Output> {
  const nItems = input.demands.length;
  const T = input.capacities.length;
  const m = new Model("MultiItemCLSP");

  const setups = m.binary(nItems, T, { prefix: "y" });
  const production = m.continuous(nItems, T, { lb: 0, prefix: "x" });
  const inventory = m.continuous(nItems, T, { lb: 0, prefix: "inv" });

  // TODO:
  // 1. Add inventory flow balance per item i and period t
  // 2. Link production[i][t] <= remDemand(i, t) * setups[i][t]
  // 3. Enforce shared machine-hour capacity: sum_i (unitTimes[i] * production[i][t] + setupTimes[i] * setups[i][t]) <= capacities[t]
  // 4. Minimize total setup + holding cost, await m.solve(), and return { setups, production, inventory, totalCost }
  throw new Error("Not implemented");
}
