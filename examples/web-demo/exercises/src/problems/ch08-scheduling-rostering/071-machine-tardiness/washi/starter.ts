import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P071Input {
  releaseDates: number[];
  processingTimes: number[];
  dueDates: number[];
  weights: number[];
}

export interface P071Output {
  starts: number[];
  totalWeightedTardiness: number;
}

export async function solve(input: P071Input): Promise<P071Output> {
  const n = input.processingTimes.length;
  const horizon =
    Math.max(...input.releaseDates) +
    input.processingTimes.reduce((a, b) => a + b, 0);
  const m = new Model("MachineTardiness");

  const starts = input.releaseDates.map((r, j) =>
    m.continuous({ lb: r, ub: horizon - input.processingTimes[j], name: `s_${j}` })
  );
  const tardiness = m.continuous(n, { lb: 0, prefix: "T" });

  // TODO:
  // 1. Define tardiness: tardiness[j] >= starts[j] + processingTimes[j] - dueDates[j]
  // 2. For each pair i < j, introduce binary y_ij and Big-M disjunctive constraints (M = horizon)
  // 3. Minimize dot(input.weights, tardiness), solve, and return { starts, totalWeightedTardiness }
  throw new Error("Not implemented");
}
