import { Model, distinct, expr, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P031Input {
  numChannels: number;
  weights: number[];
  adjacentConflicts: number[][];
}

export interface P031Output {
  channels: number[];
  totalCost: number;
}

export async function solve(input: P031Input): Promise<P031Output> {
  const n = input.weights.length;
  const m = new Model("DistinctChannelAssignment");

  // TODO: Model the channel assignments, interference separation, and cost objective.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
