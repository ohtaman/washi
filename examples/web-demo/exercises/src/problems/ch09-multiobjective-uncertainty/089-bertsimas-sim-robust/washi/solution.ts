import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P089Input {
  profits: number[];
  nominalUsages: number[];
  deviations: number[];
  maxUnits: number[];
  capacityCap: number;
  gamma: number;
}

export interface P089Output {
  quantities: number[];
  totalProfit: number;
}

export async function solve(input: P089Input): Promise<P089Output> {
  const n = input.profits.length;
  const m = new Model("BertsimasSimRobust");

  const x = input.maxUnits.map((ub, j) =>
    m.continuous({ lb: 0, ub, name: `x_${j}` })
  );
  const z = m.continuous("z", { lb: 0 });
  const p = m.continuous(n, { lb: 0, prefix: "p" });

  m.constraint(
    input.deviations.map((dev, j) => expr`${z} + ${p[j]} >= ${dev} * ${x[j]}`)
  );
  m.constraint(
    expr`dot(${input.nominalUsages}, ${x}) + ${input.gamma} * ${z} + sum(${p}) <= ${input.capacityCap}`,
    "robust_cap"
  );

  m.objective(maximize(expr`dot(${input.profits}, ${x})`));
  await m.solve();

  return {
    quantities: x.map((v) => v.value!),
    totalProfit: m.objectiveValue!,
  };
}
