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

  const open = input.supplies.map((_, i) =>
    input.demands.map((_, j) => m.binary(`open_${i}_${j}`))
  );
  const shipments = input.supplies.map((_, i) =>
    input.demands.map((_, j) => m.continuous(`ship_${i}_${j}`, { lb: 0 }))
  );

  // TODO:
  // 1. Link lane capacity to activation: shipments[i][j] <= capacities[i][j] * open[i][j]
  // 2. Enforce warehouse supply limits: sum(shipments[i]) <= supplies[i]
  // 3. Enforce store demand requirements: sum_i shipments[i][j] >= demands[j]
  // 4. Minimize dot(fixedCosts, open) + dot(unitCosts, shipments), solve, and return result
  throw new Error("Not implemented");
}
