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
  const horizon =
    Math.max(...input.releaseTimes) +
    input.durations.reduce((acc, d) => acc + d, 0);
  const m = new Model("DisjointScheduling");

  const starts = input.durations.map((d, i) =>
    m.integer(`start_${i}`, { lb: input.releaseTimes[i], ub: horizon - d })
  );

  m.constraint(
    input.precedences.map(
      ([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`
    )
  );

  // TODO: Group tasks by input.machines[i] and add a disjoint(...) constraint for each machine

  m.objective(
    minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`)))
  );
  await m.solve({ solver: "pumpkin" });

  return {
    starts: starts.map((v) => Math.round(v.value!) || 0),
    makespan: Math.round(m.objectiveValue!) || 0,
  };
}
