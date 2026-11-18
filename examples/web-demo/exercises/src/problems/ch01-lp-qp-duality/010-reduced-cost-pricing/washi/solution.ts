import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P010Input {
  baseMargins: number[];
  candidateMargins: number[];
  usages: number[][];
  capacities: number[];
}

export async function solve(input: P010Input) {
  const B = input.baseMargins.length;
  const C = input.candidateMargins.length;
  const allMargins = [...input.baseMargins, ...input.candidateMargins];
  const m = new Model("ReducedCostBoss");

  const quantities = m.continuous(B + C, { lb: 0, prefix: "x" });
  const constrs = input.capacities.map((cap, k) =>
    m.constraint(expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`, `res_${k}`)
  );

  m.objective(maximize(expr`dot(${allMargins}, ${quantities})`));
  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  const cleanZero = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  const shadowPrices = constrs.map((c) => cleanZero(c.dual ?? 0));
  const candidateReducedCosts = quantities.slice(B).map((v, c) => {
    if (v.reducedCost !== null && v.reducedCost !== undefined) {
      return cleanZero(v.reducedCost);
    }
    const oppCost = input.usages.reduce((acc, row, k) => acc + row[B + c] * shadowPrices[k], 0);
    return cleanZero(input.candidateMargins[c] - oppCost);
  });

  return {
    baseQuantities: quantities.slice(0, B).map((v) => v.value!),
    candidateQuantities: quantities.slice(B).map((v) => v.value!),
    optimalProfit: m.objectiveValue!,
    shadowPrices,
    candidateReducedCosts,
    minMarginIncreaseNeeded: candidateReducedCosts.map((rc) => cleanZero(Math.max(0, -rc))),
  };
}
