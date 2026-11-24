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

  // Decision variables: binary open[i] (facility i opened) and continuous shipments[i][j] >= 0.
  const open = m.binary(nF, { prefix: "open" });
  const shipments = input.fixedCosts.map((_, i) =>
    input.demands.map((_, j) => m.continuous(`ship_${i}_${j}`, { lb: 0 }))
  );

  // Facility capacity linking: total outbound flow from facility i is <= capacities[i] only when open[i] = 1.
  m.constraint(
    shipments.map((row, i) => expr`${sum(row)} <= ${input.capacities[i]} * ${open[i]}`)
  );
  // Customer demand satisfaction constraints.
  m.constraint(
    input.demands.map(
      (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
    )
  );

  // Objective: minimize fixed facility opening costs plus variable shipping costs.
  m.objective(
    minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
  );
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    open: open.map((v) => Math.round(v.value!) || 0),
    shipments: shipments.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
