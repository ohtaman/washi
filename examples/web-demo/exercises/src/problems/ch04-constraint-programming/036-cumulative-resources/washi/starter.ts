import { Model, cumulative, expr, max, minimize } from "@ohtaman/washi";

export interface P036Input {
  capacity: number;
  durations: number[];
  demands: number[];
  precedences: number[][];
}

export interface P036Output {
  starts: number[];
  makespan: number;
}

export async function solve(input: P036Input): Promise<P036Output> {
  const horizon = input.durations.reduce((acc, d) => acc + d, 0);
  const m = new Model("CumulativeRCPSP");

  // TODO: Model task start times, precedences, cumulative resource capacity, and makespan.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
