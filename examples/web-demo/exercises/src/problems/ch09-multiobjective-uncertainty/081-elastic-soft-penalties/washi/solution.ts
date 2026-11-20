import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P081Input {
  unitCosts: number[];
  hours: number[];
  targets: number[];
  shortfallPenalties: number[];
  excessPenalties: number[];
  machineCap: number;
  minTotal: number;
}

export interface P081Output {
  quantities: number[];
  shortfalls: number[];
  excesses: number[];
  totalCost: number;
}

export async function solve(input: P081Input): Promise<P081Output> {
  const n = input.unitCosts.length;
  const m = new Model("ElasticSoftPenalties");

  const quantities = m.continuous(n, { lb: 0, prefix: "q" });
  const shortfalls = m.continuous(n, { lb: 0, prefix: "s_neg" });
  const excesses = m.continuous(n, { lb: 0, prefix: "s_pos" });

  m.constraint(
    input.targets.map(
      (target, j) => expr`${quantities[j]} + ${shortfalls[j]} - ${excesses[j]} == ${target}`
    )
  );
  m.constraint(expr`dot(${input.hours}, ${quantities}) <= ${input.machineCap}`, "machine_cap");
  m.constraint(expr`sum(${quantities}) >= ${input.minTotal}`, "min_total");

  m.objective(
    minimize(
      expr`dot(${input.unitCosts}, ${quantities}) + dot(${input.shortfallPenalties}, ${shortfalls}) + dot(${input.excessPenalties}, ${excesses})`
    )
  );
  await m.solve();

  return {
    quantities: quantities.map((v) => v.value!),
    shortfalls: shortfalls.map((v) => v.value!),
    excesses: excesses.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
