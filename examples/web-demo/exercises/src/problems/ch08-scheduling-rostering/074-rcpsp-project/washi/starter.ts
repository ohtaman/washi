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

  // TODO:
  // 1. Add DAG precedence edges: starts[u] + durations[u] <= starts[v]
  // 2. For each renewable resource r, enforce cumulative(tasks, capacities[r])
  // 3. Minimize max(starts[i] + durations[i]), await m.solve(), and return { starts, makespan }
  throw new Error("Not implemented");
}
