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
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
