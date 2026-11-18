import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P006Input {
  x: number[];
  y: number[];
  linfWeight: number;
}

export async function solve(input: P006Input) {
  const n = input.x.length;
  const m = new Model("RobustFit");

  // Unrestricted slope & intercept (remember: lb defaults to 0 unless set!)
  const slope = m.continuous({ lb: -Infinity, name: "a" });
  const intercept = m.continuous({ lb: -Infinity, name: "b" });
  const absErr = m.continuous(n, { lb: 0, prefix: "e" });
  const maxErr = m.continuous({ lb: 0, name: "mErr" });

  // TODO:
  // 1. Add L1 absolute error bounds on absErr[i] >= +/- (slope * x[i] + intercept - y[i])
  // 2. Bound maxErr >= absErr[i]
  // 3. Minimize sum(absErr) + input.linfWeight * maxErr
  // 4. Return { slope, intercept, objective }
  throw new Error("Not implemented");
}
