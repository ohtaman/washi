import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P070Input {
  demands: number[];
  setupCost: number;
  holdCost: number;
  prodCap: number;
  setupPower: number;
  unitPower: number;
  baseLoads: number[];
  prices: number[];
  demandCharge: number;
  batteryCap: number;
  initSoc: number;
  maxPower: number;
  etaCharge: number;
  etaDischarge: number;
}

export interface P070Output {
  setups: number[];
  production: number[];
  inventory: number[];
  charge: number[];
  discharge: number[];
  soc: number[];
  peakLoad: number;
  totalCost: number;
}

export async function solve(input: P070Input): Promise<P070Output> {
  const m = new Model("EnergyCoupledSCM");

  // TODO:
  // 1. Declare lot-sizing variables (setups, production, inventory) and battery dispatch variables (charge, discharge, mode, soc, gridLoad, peakLoad)
  // 2. Link production <= prodCap * setups[t] and product inventory conservation
  // 3. Couple electrical load: gridLoad[t] == baseLoads[t] + setupPower * setups[t] + unitPower * production[t] + charge[t] - discharge[t] >= 0
  // 4. Enforce battery SOC balance (with terminal soc >= initSoc), charge/discharge mutual exclusion, and peakLoad >= gridLoad[t]
  // 5. Minimize setup + holding + energy + demandCharge * peakLoad, await m.solve(), and return outputs
  throw new Error("Not implemented");
}
