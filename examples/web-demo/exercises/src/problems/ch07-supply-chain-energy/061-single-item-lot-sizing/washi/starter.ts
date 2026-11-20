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
  const m = new Model("SingleItemLotSizing");

  const setups = m.binary(T, { prefix: "y" });
  const production = m.continuous(T, { lb: 0, prefix: "x" });
  const inventory = m.continuous(T, { lb: 0, prefix: "inv" });

  // TODO:
  // 1. Link production to binary setup: production[t] <= capacities[t] * setups[t]
  //    (or try the tighter facility-location disaggregation w_{t,k} <= demands[k] * setups[t]!)
  // 2. Enforce inventory flow balance: prevInv + production[t] - inventory[t] == demands[t] (prevInv = 0 at t = 0)
  // 3. Minimize setup + production + holding cost, await m.solve(), and return { setups, production, inventory, totalCost }
  throw new Error("Not implemented");
}
