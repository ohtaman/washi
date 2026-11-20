import { Model, disjoint, expr, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P073Input {
  machines: number[][];
  durations: number[][];
}

export interface P073Output {
  starts: number[][];
  makespan: number;
}

export async function solve(input: P073Input): Promise<P073Output> {
  const m = new Model("JobShopCP", { solver: "pumpkin" });
  const horizon = input.durations.flat().reduce((a, b) => a + b, 0);

  const starts = input.durations.map((jobDurs, j) =>
    jobDurs.map((d, o) => m.integer(`s_${j}_${o}`, { lb: 0, ub: horizon - d }))
  );

  // TODO:
  // 1. Add intra-job operation precedences: starts[j][o] + durations[j][o] <= starts[j][o + 1]
  // 2. Group operations by machine index and add disjoint(ops) for each machine
  // 3. Minimize max(completion times), await m.solve(), and return { starts, makespan }
  throw new Error("Not implemented");
}
