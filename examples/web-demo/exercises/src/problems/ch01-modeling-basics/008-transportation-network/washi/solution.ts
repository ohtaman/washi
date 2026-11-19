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
  const m = new Model("Transportation");

  const shipments = input.supplies.map((_, i) =>
    input.demands.map((_, j) => m.continuous(`ship_${i}_${j}`, { lb: 0 }))
  );

  m.constraint(
    shipments.map((row, i) => expr`${sum(row)} <= ${input.supplies[i]}`)
  );
  m.constraint(
    input.demands.map(
      (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
    )
  );

  const totalExpr = sum(
    shipments.flatMap((row, i) =>
      row.map((flow, j) => expr`${input.unitCosts[i][j]} * ${flow}`)
    )
  );
  m.objective(minimize(totalExpr));
  await m.solve();

  return {
    shipments: shipments.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
