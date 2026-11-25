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

  // Portfolio weights w, free VaR threshold eta, and tail-loss excess u[s] >= 0 (Rockafellar-Uryasev LP)
  const w = m.continuous(n, { lb: 0, ub: input.maxWeight, prefix: "w" });
  const eta = m.continuous("eta", { lb: -Infinity, ub: Infinity });
  const u = m.continuous(S, { lb: 0, prefix: "u" });

  // Fully invested portfolio
  m.constraint(expr`sum(${w}) == 1`, "budget");
  // Linearize tail excess u[s] >= max(0, loss[s] - eta) where loss[s] = -dot(returns[s], w)
  m.constraint(
    input.returns.map(
      (row, s) => expr`dot(${row}, ${w}) + ${eta} + ${u[s]} >= 0`
    )
  );

  // Mean-CVaR objective: expected loss + riskWeight * (eta + E[u] / (1 - alpha))
  const expectedLoss = sum(
    input.returns.map((row, s) => expr`-${input.probs[s]} * dot(${row}, ${w})`)
  );
  const cvarExpr = expr`${eta} + ${1 / (1 - input.alpha)} * dot(${input.probs}, ${u})`;

  m.objective(minimize(expr`${expectedLoss} + ${input.riskWeight} * ${cvarExpr}`));
  await m.solve();

  return {
    weights: w.map((v) => v.value!),
    varThreshold: eta.value!,
    cvar: cvarExpr.value!,
    totalObjective: m.objectiveValue!,
  };
}
