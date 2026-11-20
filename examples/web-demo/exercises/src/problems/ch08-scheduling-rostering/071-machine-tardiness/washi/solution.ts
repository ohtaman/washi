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
  const M = horizon;
  const m = new Model("MachineTardiness");

  const starts = input.releaseDates.map((r, j) =>
    m.continuous({ lb: r, ub: horizon - input.processingTimes[j], name: `s_${j}` })
  );
  const tardiness = m.continuous(n, { lb: 0, prefix: "T" });

  m.constraint(
    tardiness.map(
      (T, j) =>
        expr`${T} >= ${starts[j]} + ${input.processingTimes[j]} - ${input.dueDates[j]}`
    )
  );

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const y = m.binary(`y_${i}_${j}`);
      m.constraint([
        expr`${starts[i]} + ${input.processingTimes[i]} <= ${starts[j]} + ${M} * (1 - ${y})`,
        expr`${starts[j]} + ${input.processingTimes[j]} <= ${starts[i]} + ${M} * ${y}`,
      ]);
    }
  }

  m.objective(minimize(expr`dot(${input.weights}, ${tardiness})`));
  await m.solve();

  return {
    starts: starts.map((v) => v.value!),
    totalWeightedTardiness: m.objectiveValue!,
  };
}
