import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P024Input {
  numCoeffs: number[];
  numConst: number;
  denCoeffs: number[];
  denConst: number;
  usages: number[][];
  capacities: number[];
  upperBounds: number[];
}

export interface P024Output {
  x: number[];
  maxRatio: number;
}

export async function solve(input: P024Input): Promise<P024Output> {
  const n = input.numCoeffs.length;
  const m = new Model("CharnesCooperRatio");

  // TODO: Formulate the Charnes-Cooper LP, maximize the linearized ratio, and recover x and maxRatio.
  throw new Error("Not implemented");
}
