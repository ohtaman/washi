import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P023Input {
  demands: number[];
  minRegular: number[];
  maxRegular: number[];
  regularCosts: number[];
  overtimePenalties: number[];
  totalRegularCap: number;
}

export interface P023Output {
  regular: number[];
  shortage: number[];
  totalCost: number;
}

export async function solve(input: P023Input): Promise<P023Output> {
  const T = input.demands.length;
  const m = new Model("PositivePartOvertime");

  // TODO: Build and solve the overtime and shortage cost LP, then return the output.
  throw new Error("Not implemented");
}
