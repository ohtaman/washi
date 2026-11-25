import { Model, disjoint, expr, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

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
  // Safe upper bound on schedule completion: latest release + sum of all durations
  const horizon =
    Math.max(...input.releaseTimes) +
    input.durations.reduce((acc, d) => acc + d, 0);
  const m = new Model("DisjointScheduling");

  // starts[i]: integer start time of task i, bounded by its release time and horizon - duration
  const starts = input.durations.map((d, i) =>
    m.integer(`start_${i}`, { lb: input.releaseTimes[i], ub: horizon - d })
  );

  // Precedence constraints: task u must finish before task v starts
  m.constraint(
    input.precedences.map(
      ([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`
    )
  );

  // No-overlap constraints per machine using the global disjoint() constraint
  const numMachines = Math.max(...input.machines) + 1;
  m.constraint(
    Array.from({ length: numMachines }, (_, mach) =>
      starts
        .map((s, i) => ({
          start: s,
          duration: input.durations[i],
          mach: input.machines[i],
        }))
        .filter((t) => t.mach === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
      .filter((tasks) => tasks.length > 0)
      .map((tasks) => disjoint(tasks))
  );

  // Minimize makespan (maximum completion time across all tasks)
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
