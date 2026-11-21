import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P030Input {
  baseCosts: number[];
  values: number[];
  minValue: number;
  loads: number[][];
  targets: number[];
  devWeights: number[];
  peakWeight: number;
  pairs: number[][];
}

export interface P030Output {
  selected: number[];
  pairProducts: number[];
  peakLoad: number;
  totalCost: number;
}

export async function solve(input: P030Input): Promise<P030Output> {
  const n = input.baseCosts.length;
  const mZones = input.loads.length;
  const P = input.pairs.length;
  const m = new Model("LinearizationSynthesis");

  // TODO: Build and solve the multi-pattern service allocation MIP, then return the output.
  throw new Error("Not implemented");
}
