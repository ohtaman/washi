import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P086Input {
  actualDemands: number[];
  forecastDemands: number[];
  prodCosts: number[];
  prodCap: number;
  holdCost: number;
  shortfallPenalty: number;
  initialInventory: number;
  windowLen: number;
}

export interface P086Output {
  produced: number[];
  inventories: number[];
  shortfalls: number[];
  totalCost: number;
}

export async function solve(input: P086Input): Promise<P086Output> {
  const T = input.actualDemands.length;
  const produced: number[] = [];
  const inventories: number[] = [];
  const shortfalls: number[] = [];

  // TODO:
  // For each step t = 0 .. T - 1:
  // 1. Solve a lookahead LP over window [t, min(T, t + windowLen)) using forecastDemands
  //    and starting from current realized inventory invCurr (initialInventory at t = 0)
  // 2. Commit ONLY x[0] as produced[t]
  // 3. Apply actualDemands[t] to update realized inventory, shortfall, and accumulated realized cost
  // 4. Return { produced, inventories, shortfalls, totalCost }
  throw new Error("Not implemented");
}
