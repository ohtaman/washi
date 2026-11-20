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

  m.constraint(
    expr`dot(${input.denCoeffs}, ${y}) + ${input.denConst} * ${t} == 1`,
    "cc_norm"
  );
  m.constraint(
    input.capacities.map((cap, k) => expr`dot(${input.usages[k]}, ${y}) <= ${cap} * ${t}`)
  );
  m.constraint(
    input.upperBounds.map((ub, j) => expr`${y[j]} <= ${ub} * ${t}`)
  );

  m.objective(maximize(expr`dot(${input.numCoeffs}, ${y}) + ${input.numConst} * ${t}`));
  await m.solve();

  const tVal = t.value!;
  return {
    x: y.map((v) => v.value! / tVal),
    maxRatio: m.objectiveValue!,
  };
}
