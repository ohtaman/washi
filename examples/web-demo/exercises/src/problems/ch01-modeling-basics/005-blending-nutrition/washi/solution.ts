import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P005Input {
  targetBatch: number;
  costs: number[];
  availabilities: number[];
  compositions: number[][];
  minRatios: number[];
  maxRatios: number[];
}

export interface P005Output {
  amounts: number[];
  totalCost: number;
}

export async function solve(input: P005Input): Promise<P005Output> {
  const m = new Model("AlloyBlending");

  const amounts = input.availabilities.map((avail, i) =>
    m.continuous({ lb: 0, ub: avail, name: `amt_${i}` })
  );

  m.constraint(expr`${sum(amounts)} == ${input.targetBatch}`, "total_weight");

  m.constraint(
    input.minRatios.flatMap((minRatio, k) => {
      const elemCol = input.compositions.map((row) => row[k]);
      return [
        expr`dot(${elemCol}, ${amounts}) >= ${minRatio * input.targetBatch}`,
        expr`dot(${elemCol}, ${amounts}) <= ${input.maxRatios[k] * input.targetBatch}`,
      ];
    })
  );

  m.objective(minimize(expr`dot(${input.costs}, ${amounts})`));
  await m.solve();

  return {
    amounts: amounts.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
