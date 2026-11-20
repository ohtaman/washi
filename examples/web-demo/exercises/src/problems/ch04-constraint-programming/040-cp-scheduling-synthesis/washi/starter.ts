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

  const starts = input.jobs.map((j, i) =>
    m.integer(`start_${i}`, { lb: 0, ub: horizon - j.duration })
  );
  const modes = input.jobs.map((j, i) =>
    m.integer(`mode_${i}`, { lb: 0, ub: j.setupTimes.length - 1 })
  );

  m.constraint(
    input.jobs.map((j, i) => expr`${starts[i]} >= at(${j.setupTimes}, ${modes[i]})`)
  );
  m.constraint(
    input.precedences.map(
      ([u, v]) =>
        expr`${starts[u]} + ${input.jobs[u].duration} + at(${input.jobs[u].postTimes}, ${modes[u]}) <= ${starts[v]}`
    )
  );

  // TODO 1: Add disjoint(...) per machine over { start: starts[i], duration: jobs[i].duration }
  // TODO 2: Add cumulative(..., input.powerCap) using demand: jobs[i].power
  // TODO 3: Add allowed([modes[u], modes[v]], rule.allowedPairs) for each rule in input.modeRules

  m.objective(
    minimize(
      max(
        input.jobs.map(
          (j, i) => expr`${starts[i]} + ${j.duration} + at(${j.postTimes}, ${modes[i]})`
        )
      )
    )
  );
  await m.solve({ solver: "pumpkin" });

  return {
    starts: starts.map((v) => Math.round(v.value!) || 0),
    modes: modes.map((v) => Math.round(v.value!) || 0),
    makespan: Math.round(m.objectiveValue!) || 0,
  };
}
