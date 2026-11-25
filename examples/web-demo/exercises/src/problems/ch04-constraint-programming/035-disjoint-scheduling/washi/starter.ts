import { Model, disjoint, expr, max, minimize } from "@ohtaman/washi";

export interface P035Input {
  durations: number[];
  releaseTimes: number[];
  machines: number[];
  precedences: number[][];
}

export interface P035Output {
  starts: number[];
  makespan: number;
}

export async function solve(input: P035Input): Promise<P035Output> {
  const horizon =
    Math.max(...input.releaseTimes) +
    input.durations.reduce((acc, d) => acc + d, 0);
  const m = new Model("DisjointScheduling");

  // TODO: Model task start times, precedences, per-machine non-overlap, and makespan.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
