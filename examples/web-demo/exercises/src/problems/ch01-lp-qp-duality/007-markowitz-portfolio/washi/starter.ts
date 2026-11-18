import { Model, QuadExpr, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P007Input {
  expectedReturns: number[];
  covariance: number[][];
  maxWeights: number[];
  minReturn: number;
}

export async function solve(input: P007Input) {
  const n = input.expectedReturns.length;
  const m = new Model("MarkowitzPortfolio");

  const weights = input.maxWeights.map((ub, i) =>
    m.continuous({ lb: 0, ub, name: `w_${i}` })
  );

  // TODO:
  // 1. Add budget constraint sum(weights) == 1 and expected return >= input.minReturn
  // 2. Construct quadratic variance objective using QuadExpr (w[i].mul(w[j]).mul(cov[i][j]))
  // 3. Solve with m.solve() and return { weights, variance }
  throw new Error("Not implemented");
}
