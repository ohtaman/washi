import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P008Input {
  supplies: number[];
  demands: number[];
  unitCosts: number[][];
}

export interface P008Output {
  shipments: number[][];
  totalCost: number;
}

export async function solve(input: P008Input): Promise<P008Output> {
  const nS = input.supplies.length;
  const nD = input.demands.length;
  const m = new Model("Transportation");

  const shipments = Array.from({ length: nS }, (_, i) =>
    Array.from({ length: nD }, (_, j) => m.continuous(`ship_${i}_${j}`, { lb: 0 }))
  );

  for (let i = 0; i < nS; i++) {
    m.constraint(expr`${sum(shipments[i])} <= ${input.supplies[i]}`, `supply_${i}`);
  }
  for (let j = 0; j < nD; j++) {
    const col = shipments.map((row) => row[j]);
    m.constraint(expr`${sum(col)} >= ${input.demands[j]}`, `demand_${j}`);
  }

  const totalExpr = sum(
    shipments.flatMap((row, i) =>
      row.map((flow, j) => expr`${input.unitCosts[i][j]} * ${flow}`)
    )
  );
  m.objective(minimize(totalExpr));

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    shipments: shipments.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
