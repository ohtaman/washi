import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P066Input {
  supplies: number[][];
  demands: number[][];
  arrivalTimes: number[];
  dueTimes: number[];
  inDoorCaps: number[];
  outDoorCaps: number[];
  handlingCosts: number[][];
  transferTimes: number[][];
  delayCost: number;
}

export interface P066Output {
  inDoor: number[];
  outDoor: number[];
  flows: number[][][];
  departures: number[];
  totalCost: number;
}

export async function solve(input: P066Input): Promise<P066Output> {
  // TODO: Build and solve the model, then return the output.
  throw new Error("Not implemented");
}
