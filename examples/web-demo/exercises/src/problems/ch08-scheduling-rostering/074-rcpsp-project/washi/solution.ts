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
  // Solve via Pumpkin CP solver using global cumulative resource constraints
  const m = new Model("RcpspProjectCP", { solver: "pumpkin" });
  const horizon = input.durations.reduce((a, b) => a + b, 0);

  // starts[i]: integer start time of activity i in [0, horizon - durations[i]]
  const starts = input.durations.map((d, i) =>
    m.integer(`s_${i}`, { lb: 0, ub: horizon - d })
  );

  // Precedence relations: predecessor u must finish before successor v starts
  m.constraint(
    input.precedences.map(
      ([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`
    )
  );

  // Renewable resource capacity: total demand of active tasks at any time <= capacities[r]
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

  // Objective: minimize project makespan (maximum activity completion time)
  m.objective(
    minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`)))
  );
  await m.solve();

  return {
    // Round integer values to strip solver representation noise
    starts: starts.map((v) => Math.round(v.value!) || 0),
    makespan: Math.round(m.objectiveValue!) || 0,
  };
}
