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

  m.constraint(expr`${sum(weights)} == 1`, "budget");
  m.constraint(expr`dot(${input.expectedReturns}, ${weights}) >= ${input.minReturn}`, "target_return");

  let variance = new QuadExpr();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = input.covariance[i][j];
      if (c !== 0) {
        variance = variance.add(weights[i].mul(weights[j]).mul(c));
      }
    }
  }

  m.objective(minimize(variance));
  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    weights: weights.map((v) => v.value!),
    variance: m.objectiveValue!,
  };
}
