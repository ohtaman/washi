import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P088Input {
  returns: number[][];
  probs: number[];
  alpha: number;
  riskWeight: number;
  maxWeight: number;
}

export interface P088Output {
  weights: number[];
  varThreshold: number;
  cvar: number;
  totalObjective: number;
}

export async function solve(input: P088Input): Promise<P088Output> {
  const S = input.returns.length;
  const n = input.returns[0].length;
  const m = new Model("LinearizedCVaR");

  const w = m.continuous(n, { lb: 0, ub: input.maxWeight, prefix: "w" });
  const eta = m.continuous("eta", { lb: -Infinity, ub: Infinity });
  const u = m.continuous(S, { lb: 0, prefix: "u" });

  // TODO:
  // 1. Add budget simplex constraint: sum(w) == 1
  // 2. For each scenario s, add Rockafellar-Uryasev excess constraint:
  //    u[s] >= -dot(returns[s], w) - eta
  // 3. Build cvarExpr = eta + (1 / (1 - alpha)) * dot(probs, u) and expectedLossExpr
  // 4. Minimize expectedLossExpr + riskWeight * cvarExpr, solve, and return { weights, varThreshold, cvar, totalObjective }
  throw new Error("Not implemented");
}
