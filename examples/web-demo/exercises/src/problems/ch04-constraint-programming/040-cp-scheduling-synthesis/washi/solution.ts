import {
  Model,
  allowed,
  cumulative,
  disjoint,
  expr,
  max,
  minimize,
} from "@ohtaman/washi";

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
  // Safe upper bound on completion: sum of all job durations plus worst-case setup and post times
  const horizon = input.jobs.reduce(
    (acc, j) =>
      acc + j.duration + Math.max(...j.setupTimes) + Math.max(...j.postTimes),
    0
  );
  const m = new Model("FactoryCellSynthesisCP");

  // starts[i]: integer start time of job i; modes[i]: 0-based operating mode index for job i
  const starts = input.jobs.map((j, i) =>
    m.integer(`start_${i}`, { lb: 0, ub: horizon - j.duration })
  );
  const modes = input.jobs.map((j, i) =>
    m.integer(`mode_${i}`, { lb: 0, ub: j.setupTimes.length - 1 })
  );

  // Mode-dependent release (setup time) and precedence (duration + post-processing time) via at()
  m.constraint(
    input.jobs.map((j, i) => expr`${starts[i]} >= at(${j.setupTimes}, ${modes[i]})`)
  );
  m.constraint(
    input.precedences.map(
      ([u, v]) =>
        expr`${starts[u]} + ${input.jobs[u].duration} + at(${input.jobs[u].postTimes}, ${modes[u]}) <= ${starts[v]}`
    )
  );

  // Disjunctive machine capacity: jobs assigned to the same machine cannot overlap
  const numMachines = Math.max(...input.jobs.map((j) => j.machine)) + 1;
  m.constraint(
    Array.from({ length: numMachines }, (_, mach) =>
      input.jobs
        .map((j, i) => ({
          start: starts[i],
          duration: j.duration,
          machine: j.machine,
        }))
        .filter((t) => t.machine === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
      .filter((tasks) => tasks.length > 0)
      .map((tasks) => disjoint(tasks))
  );

  // Global power cap across all simultaneously running jobs via cumulative()
  m.constraint(
    cumulative(
      input.jobs.map((j, i) => ({
        start: starts[i],
        duration: j.duration,
        demand: j.power,
      })),
      input.powerCap
    ),
    "power_cap"
  );

  // Pairwise mode compatibility table constraints
  m.constraint(
    input.modeRules.map((rule) =>
      allowed([modes[rule.jobs[0]], modes[rule.jobs[1]]], rule.allowedPairs)
    )
  );

  // Minimize makespan including mode-dependent post-processing time
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

  // Round solver output to clean integers and normalize -0 to 0
  return {
    starts: starts.map((v) => Math.round(v.value!) || 0),
    modes: modes.map((v) => Math.round(v.value!) || 0),
    makespan: Math.round(m.objectiveValue!) || 0,
  };
}
