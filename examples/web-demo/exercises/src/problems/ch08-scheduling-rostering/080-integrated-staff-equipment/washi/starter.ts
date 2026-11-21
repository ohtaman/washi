import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P080Input {
  certified: number[][];
  equipNeeds: number[];
  equipCap: number;
  slotPenalties: number[][];
  staffCosts: number[];
  regularLimits: number[];
  maxLimits: number[];
  overtimeCosts: number[];
}

export interface P080Output {
  assignedStaff: number[];
  assignedSlot: number[];
  overtime: number[];
  totalCost: number;
}

export async function solve(input: P080Input): Promise<P080Output> {
  // TODO: Build and solve the integrated staff, slot, and equipment model, then return the output.
  throw new Error("Not implemented");
}
