import { Model, expr, minimize } from "@ohtaman/washi";

export interface P008Input {
  demands: number[];
  regCap: number[];
  otCap: number[];
  invCap: number;
  initialInventory: number;
  minFinalInventory: number;
  regCost: number;
  otCost: number;
  holdCost: number;
}

export async function solve(input: P008Input) {
  const T = input.demands.length;
  const m = new Model("ProductionInventory");

  // TODO: Declare regular[t], overtime[t], inventory[t], enforce inventory balance across periods
  // and ending safety stock, minimize cost, and return { regular, overtime, inventory, totalCost }.
  throw new Error("Not implemented");
}
