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
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
