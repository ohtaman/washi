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

  // TODO:
  // 1. Link facility capacity to opening switch: sum(shipments[i]) <= capacities[i] * open[i]
  // 2. Enforce every customer's demand: sum_i shipments[i][j] >= demands[j]
  // 3. Minimize dot(fixedCosts, open) + dot(unitCosts, shipments), solve, and return result
  throw new Error("Not implemented");
}
