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
  // Tight scheduling horizon (valid upper bound on latest completion) used as big-M
  const horizon =
    Math.max(...input.releaseDates) +
    input.processingTimes.reduce((a, b) => a + b, 0);
  const M = horizon;
  const m = new Model("MachineTardiness");

  // starts[j]: start time of job j in [releaseDates[j], horizon - processingTimes[j]]
  const starts = input.releaseDates.map((r, j) =>
    m.continuous({ lb: r, ub: horizon - input.processingTimes[j], name: `s_${j}` })
  );
  // tardiness[j]: lateness beyond dueDates[j] (>= 0)
  const tardiness = m.continuous(n, { lb: 0, prefix: "T" });

  // Tardiness definition: T_j >= max(0, s_j + p_j - d_j)
  m.constraint(
    tardiness.map(
      (T, j) =>
        expr`${T} >= ${starts[j]} + ${input.processingTimes[j]} - ${input.dueDates[j]}`
    )
  );

  // Disjunctive non-overlap constraints on the single machine:
  // y_{i,j} = 1 if job i precedes job j, 0 if job j precedes job i (big-M = horizon)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const y = m.binary(`y_${i}_${j}`);
      m.constraint([
        expr`${starts[i]} + ${input.processingTimes[i]} <= ${starts[j]} + ${M} * (1 - ${y})`,
        expr`${starts[j]} + ${input.processingTimes[j]} <= ${starts[i]} + ${M} * ${y}`,
      ]);
    }
  }

  // Objective: minimize total weighted tardiness across all jobs
  m.objective(minimize(expr`dot(${input.weights}, ${tardiness})`));
  await m.solve();

  return {
    starts: starts.map((v) => v.value!),
    totalWeightedTardiness: m.objectiveValue!,
  };
}
