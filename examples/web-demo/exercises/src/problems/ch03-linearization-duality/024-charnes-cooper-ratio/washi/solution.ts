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

  // Charnes-Cooper transformation: introduce t = 1 / (denCoeffs^T x + denConst) >= 0 and y = t * x >= 0
  // to convert the linear-fractional program into an equivalent LP.
  const y = m.continuous(n, { lb: 0, prefix: "y" });
  const t = m.continuous("t", { lb: 0 });

  // Normalization constraint fixing the scaled denominator to 1.
  m.constraint(
    expr`dot(${input.denCoeffs}, ${y}) + ${input.denConst} * ${t} == 1`,
    "cc_norm"
  );
  // Homogenized resource and upper-bound constraints (A y <= b * t and y_j <= ub_j * t).
  m.constraint(
    input.capacities.map((cap, k) => expr`dot(${input.usages[k]}, ${y}) <= ${cap} * ${t}`)
  );
  m.constraint(
    input.upperBounds.map((ub, j) => expr`${y[j]} <= ${ub} * ${t}`)
  );

  // Objective: maximize the homogenized numerator, which equals the original ratio.
  m.objective(maximize(expr`dot(${input.numCoeffs}, ${y}) + ${input.numConst} * ${t}`));
  await m.solve();

  // Recover original decision variables via x = y / t.
  const tVal = t.value!;
  return {
    x: y.map((v) => v.value! / tVal),
    maxRatio: m.objectiveValue!,
  };
}
