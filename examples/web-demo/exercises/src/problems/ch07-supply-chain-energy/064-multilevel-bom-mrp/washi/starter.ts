import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P064Input {
  externalDemands: number[][];
  bom: number[][];
  leadTimes: number[];
  initialInventory: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCosts: number[];
  capacities: number[];
}

export interface P064Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export async function solve(input: P064Input): Promise<P064Output> {
  const nItems = input.externalDemands.length;
  const T = input.externalDemands[0]?.length ?? 0;
  const m = new Model("MultilevelBomMrp");

  const setups = m.binary(nItems, T, { prefix: "y" });
  const production = input.capacities.map((ub, i) =>
    Array.from({ length: T }, (_, t) => m.integer(`x_${i}_${t}`, { lb: 0, ub }))
  );
  const inventory = m.continuous(nItems, T, { lb: 0, prefix: "inv" });

  // TODO:
  // 1. Link integer lot size to setup: production[i][t] <= capacities[i] * setups[i][t]
  // 2. Enforce multi-level BOM flow balance with lead times:
  //    prevInv + arrival(i, t - leadTimes[i]) - externalDemands[i][t] - sum_j bom[i][j] * production[j][t] == inventory[i][t]
  // 3. Minimize total setup + production + holding cost, await m.solve(), and return { setups, production, inventory, totalCost }
  throw new Error("Not implemented");
}
