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

  // Decision variables: continuous amount of each raw material, bounded by availability.
  const amounts = input.availabilities.map((avail, i) =>
    m.continuous({ lb: 0, ub: avail, name: `amt_${i}` })
  );

  // Batch size constraint: total blended weight must equal targetBatch.
  m.constraint(expr`${sum(amounts)} == ${input.targetBatch}`, "total_weight");

  // Composition constraints: each element k must stay within [minRatio, maxRatio] of the batch.
  m.constraint(
    input.minRatios.flatMap((minRatio, k) => {
      const elemCol = input.compositions.map((row) => row[k]);
      return [
        expr`dot(${elemCol}, ${amounts}) >= ${minRatio * input.targetBatch}`,
        expr`dot(${elemCol}, ${amounts}) <= ${input.maxRatios[k] * input.targetBatch}`,
      ];
    })
  );

  // Objective: minimize total raw material cost.
  m.objective(minimize(expr`dot(${input.costs}, ${amounts})`));
  await m.solve();

  return {
    amounts: amounts.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
