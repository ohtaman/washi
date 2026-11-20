import { Model, cumulative, expr, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P074Input {
  durations: number[];
  demands: number[][];
  capacities: number[];
  precedences: number[][];
}

export interface P074Output {
  starts: number[];
  makespan: number;
}

export async function solve(input: P074Input): Promise<P074Output> {
  const m = new Model("RcpspProjectCP", { solver: "pumpkin" });
  const horizon = input.durations.reduce((a, b) => a + b, 0);

  const starts = input.durations.map((d, i) =>
    m.integer(`s_${i}`, { lb: 0, ub: horizon - d })
  );

  m.constraint(
    input.precedences.map(
      ([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`
    )
  );

  input.capacities.forEach((cap, r) => {
    const tasks = input.durations
      .map((duration, i) => ({
        start: starts[i],
        duration,
        demand: input.demands[r][i],
      }))
      .filter((task) => task.demand > 0);
    if (tasks.length > 0) {
      m.constraint(cumulative(tasks, cap), `resource_${r}`);
    }
  });

  m.objective(
    minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`)))
  );
  await m.solve();

  return {
    starts: starts.map((v) => Math.round(v.value!) || 0),
    makespan: Math.round(m.objectiveValue!) || 0,
  };
}
