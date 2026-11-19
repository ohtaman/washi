import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P008Input {
  supplies: number[];
  demands: number[];
  unitCosts: number[][];
}

export async function solve(input: P008Input) {
  const nS = input.supplies.length;
  const nD = input.demands.length;
  const m = new Model("Transportation");

  const shipments = Array.from({ length: nS }, (_, i) =>
    Array.from({ length: nD }, (_, j) => m.continuous(`ship_${i}_${j}`, { lb: 0 }))
  );

  // TODO:
  // 1. Add warehouse supply constraints: sum(shipments[i]) <= input.supplies[i]
  // 2. Add store demand constraints: column sum >= input.demands[j]
  // 3. Minimize sum_{i, j} input.unitCosts[i][j] * shipments[i][j], solve, and return { shipments, totalCost }
  throw new Error("Not implemented");
}
