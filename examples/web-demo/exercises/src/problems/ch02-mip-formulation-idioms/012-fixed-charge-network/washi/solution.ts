import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P012Input {
  supplies: number[];
  demands: number[];
  fixedCosts: number[][];
  unitCosts: number[][];
  capacities: number[][];
}

export interface P012Output {
  open: number[][];
  shipments: number[][];
  totalCost: number;
}

export async function solve(input: P012Input): Promise<P012Output> {
  const m = new Model("FixedChargeNetwork");

  // Decision variables: binary open[i][j] (whether arc i->j is active) and continuous shipments[i][j] >= 0.
  const open = input.supplies.map((_, i) =>
    input.demands.map((_, j) => m.binary(`open_${i}_${j}`))
  );
  const shipments = input.supplies.map((_, i) =>
    input.demands.map((_, j) => m.continuous(`ship_${i}_${j}`, { lb: 0 }))
  );

  // Arc capacity linking: flow is allowed up to capacities[i][j] only if arc (i, j) is open.
  m.constraint(
    shipments.flatMap((row, i) =>
      row.map((flow, j) => expr`${flow} <= ${input.capacities[i][j]} * ${open[i][j]}`)
    )
  );
  // Supply limits at origins and demand satisfaction at destinations.
  m.constraint(
    shipments.map((row, i) => expr`${sum(row)} <= ${input.supplies[i]}`)
  );
  m.constraint(
    input.demands.map(
      (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
    )
  );

  // Objective: minimize total fixed arc-opening costs plus variable shipping costs.
  m.objective(
    minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
  );
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    open: open.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    shipments: shipments.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
