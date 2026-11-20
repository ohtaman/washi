import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P020Input {
  fixedCosts: number[];
  capacities: number[];
  demands: number[];
  unitCosts: number[][];
}

export interface P020Output {
  open: number[];
  shipments: number[][];
  totalCost: number;
}

export async function solve(input: P020Input): Promise<P020Output> {
  const nF = input.fixedCosts.length;
  const m = new Model("CapacitatedFacilityLocation");

  const open = m.binary(nF, { prefix: "open" });
  const shipments = input.fixedCosts.map((_, i) =>
    input.demands.map((_, j) => m.continuous(`ship_${i}_${j}`, { lb: 0 }))
  );

  m.constraint(
    shipments.map((row, i) => expr`${sum(row)} <= ${input.capacities[i]} * ${open[i]}`)
  );
  m.constraint(
    input.demands.map(
      (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
    )
  );

  m.objective(
    minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
  );
  await m.solve();

  return {
    open: open.map((v) => Math.round(v.value!) || 0),
    shipments: shipments.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
