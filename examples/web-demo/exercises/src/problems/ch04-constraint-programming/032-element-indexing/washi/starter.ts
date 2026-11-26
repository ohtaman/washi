import { Model, at, distinct, minimize, sum } from "@ohtaman/washi";

export interface P032Input {
  costs: number[][];
}

export interface P032Output {
  assignment: number[];
  totalCost: number;
}

export async function solve(input: P032Input): Promise<P032Output> {
  const n = input.costs.length;
  const numMachines = input.costs[0].length;
  const m = new Model("ElementAssignment");

  // TODO: Model the machine assignment per job, distinctness, and cost objective.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
