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
  // TODO: Run the rolling-horizon MPC loop over all periods and return the output.
  throw new Error("Not implemented");
}
