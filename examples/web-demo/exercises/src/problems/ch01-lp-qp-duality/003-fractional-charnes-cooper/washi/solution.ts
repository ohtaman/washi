import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P003Input {
  baseRevenue: number;
  baseCost: number;
  revenues: number[];
  costs: number[];
  capacities: number[];
  minTotal: number;
  maxTotal: number;
  greenIndex: number;
  minGreenShare: number;
}

export async function solve(input: P003Input) {
  const n = input.revenues.length;
  const m = new Model("CharnesCooper");

  const t = m.continuous({ lb: 0, name: "t" });
  const y = m.continuous(n, { lb: 0, prefix: "y" });

  m.constraint(expr`${input.baseCost} * ${t} + dot(${input.costs}, ${y}) == 1`, "den_norm");

  for (let i = 0; i < n; i++) {
    m.constraint(expr`${y[i]} <= ${input.capacities[i]} * ${t}`, `cap_${i}`);
  }

  const totalY = sum(y);
  m.constraint(expr`${totalY} >= ${input.minTotal} * ${t}`, "min_tot");
  m.constraint(expr`${totalY} <= ${input.maxTotal} * ${t}`, "max_tot");
  m.constraint(expr`${y[input.greenIndex]} >= ${input.minGreenShare} * ${totalY}`, "green_share");

  m.objective(maximize(expr`${input.baseRevenue} * ${t} + dot(${input.revenues}, ${y})`));

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  const tVal = t.value!;
  return {
    quantities: y.map((v) => v.value! / tVal),
    ratio: m.objectiveValue!,
  };
}
