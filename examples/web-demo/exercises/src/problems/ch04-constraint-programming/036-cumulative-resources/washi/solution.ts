import { Model, cumulative, expr, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

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
  // Conservative horizon: sum of all task durations
  const horizon = input.durations.reduce((acc, d) => acc + d, 0);
  const m = new Model("CumulativeRCPSP");

  // starts[i]: integer start time of task i in [0, horizon - duration[i]]
  const starts = input.durations.map((d, i) =>
    m.integer(`start_${i}`, { lb: 0, ub: horizon - d })
  );

  // Precedence constraints: task u must finish before task v starts
  m.constraint(
    input.precedences.map(
      ([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`
    )
  );

  // Renewable resource capacity constraint across all overlapping tasks via cumulative()
  m.constraint(
    cumulative(
      starts.map((s, i) => ({
        start: s,
        duration: input.durations[i],
        demand: input.demands[i],
      })),
      input.capacity
    ),
    "resource_cap"
  );

  // Minimize makespan (latest task completion time)
  m.objective(
    minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`)))
  );
  await m.solve({ solver: "pumpkin" });

  // Round solver output to clean integers and normalize -0 to 0
  return {
    starts: starts.map((v) => Math.round(v.value!) || 0),
    makespan: Math.round(m.objectiveValue!) || 0,
  };
}
