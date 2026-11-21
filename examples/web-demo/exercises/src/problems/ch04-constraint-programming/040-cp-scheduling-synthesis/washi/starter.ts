import {
  Model,
  allowed,
  cumulative,
  disjoint,
  expr,
  max,
  minimize,
} from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface JobSpec {
  duration: number;
  power: number;
  machine: number;
  setupTimes: number[];
  postTimes: number[];
}

export interface ModeRule {
  jobs: [number, number];
  allowedPairs: number[][];
}

export interface P040Input {
  powerCap: number;
  jobs: JobSpec[];
  precedences: number[][];
  modeRules: ModeRule[];
}

export interface P040Output {
  starts: number[];
  modes: number[];
  makespan: number;
}

export async function solve(input: P040Input): Promise<P040Output> {
  const horizon = input.jobs.reduce(
    (acc, j) =>
      acc + j.duration + Math.max(...j.setupTimes) + Math.max(...j.postTimes),
    0
  );
  const m = new Model("FactoryCellSynthesisCP");

  // TODO: Model job start times, operating modes, machine/power/mode constraints, and makespan.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
