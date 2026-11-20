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

  const y = m.continuous(n, { lb: 0, prefix: "y" });
  const t = m.continuous("t", { lb: 0 });

  // TODO:
  // 1. Add Charnes-Cooper normalization: dot(input.denCoeffs, y) + input.denConst * t == 1
  // 2. Homogenize resource limits: dot(input.usages[k], y) <= input.capacities[k] * t
  // 3. Homogenize upper bounds: y[j] <= input.upperBounds[j] * t
  // 4. Maximize dot(input.numCoeffs, y) + input.numConst * t, solve,
  //    and recover x[j] = y[j].value! / t.value! and maxRatio = m.objectiveValue!
  throw new Error("Not implemented");
}
