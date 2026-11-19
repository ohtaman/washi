import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P005Input {
  targetBatch: number;
  costs: number[];
  availabilities: number[];
  compositions: number[][];
  minRatios: number[];
  maxRatios: number[];
}

export async function solve(input: P005Input) {
  const nRaw = input.costs.length;
  const nElem = input.minRatios.length;
  const m = new Model("AlloyBlending");

  const amounts = input.availabilities.map((avail, i) =>
    m.continuous({ lb: 0, ub: avail, name: `amt_${i}` })
  );

  m.constraint(expr`${sum(amounts)} == ${input.targetBatch}`, "total_weight");

  for (let k = 0; k < nElem; k++) {
    const elemCol = input.compositions.map((row) => row[k]);
    m.constraint(
      expr`dot(${elemCol}, ${amounts}) >= ${input.minRatios[k] * input.targetBatch}`,
      `elem_${k}_min`
    );
    m.constraint(
      expr`dot(${elemCol}, ${amounts}) <= ${input.maxRatios[k] * input.targetBatch}`,
      `elem_${k}_max`
    );
  }

  m.objective(minimize(expr`dot(${input.costs}, ${amounts})`));
  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    amounts: amounts.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
