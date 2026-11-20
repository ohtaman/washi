import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P069Input {
  baseLoads: number[];
  prices: number[];
  demandCharge: number;
  capacity: number;
  minSoc: number;
  initSoc: number;
  minFinalSoc: number;
  maxPower: number;
  etaCharge: number;
  etaDischarge: number;
}

export interface P069Output {
  charge: number[];
  discharge: number[];
  soc: number[];
  peakLoad: number;
  totalCost: number;
}

export async function solve(input: P069Input): Promise<P069Output> {
  const m = new Model("BatteryPeakShaving");

  // TODO:
  // 1. Declare charge[t], discharge[t], soc[t] (within [minSoc, capacity] and terminal >= minFinalSoc),
  //    gridLoad[t] >= 0, binary mode[t] for charge/discharge mutual exclusion, and epigraph peakLoad
  // 2. Enforce SOC balance with efficiencies etaCharge and 1 / etaDischarge, gridLoad[t] == baseLoads[t] + charge[t] - discharge[t],
  //    and peakLoad >= gridLoad[t]
  // 3. Minimize energy bill + demandCharge * peakLoad, await m.solve(), and return outputs
  throw new Error("Not implemented");
}
