import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P072Input {
  processingTimes: number[];
  setupMatrix: number[][];
  dueDates: number[];
}

export interface P072Output {
  order: number[];
  completions: number[];
  totalTardiness: number;
}

export async function solve(input: P072Input): Promise<P072Output> {
  const n = input.processingTimes.length;
  const maxSetup = Math.max(0, ...input.setupMatrix.flat());
  // Upper bound on latest completion time and big-M for sequence-dependent transition
  const horizon =
    input.processingTimes.reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * maxSetup;
  const M = horizon + maxSetup;
  const m = new Model("SequenceDependentSetups");

  // ATSP tour variables: x[i][j] = 1 if job j immediately follows job i (node n is dummy start/end depot)
  const x = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i === j ? null : m.binary(`x_${i}_${j}`)
    )
  );
  // completions[j]: completion time of job j in [p_j, horizon]; tardiness[j] >= 0
  const completions = input.processingTimes.map((p, j) =>
    m.continuous({ lb: p, ub: horizon, name: `C_${j}` })
  );
  const tardiness = m.continuous(n, { lb: 0, prefix: "T" });

  // Degree constraints: every node (jobs 0..n-1 and dummy depot n) has 1 outgoing and 1 incoming arc
  for (let i = 0; i <= n; i++) {
    const outVars = x[i].filter((v): v is NonNullable<typeof v> => v !== null);
    const inVars = x.map((row) => row[i]).filter((v): v is NonNullable<typeof v> => v !== null);
    m.constraint([expr`${sum(outVars)} == 1`, expr`${sum(inVars)} == 1`]);
  }

  // MTZ-style big-M precedence: if j follows i (x[i][j] = 1), C_j >= C_i + s_{i,j} + p_j (also eliminates subtours)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const step = input.setupMatrix[i][j] + input.processingTimes[j];
      m.constraint(
        expr`${completions[j]} >= ${completions[i]} + ${step} - ${M} * (1 - ${x[i][j]!})`
      );
    }
  }

  // Tardiness definition: T_j >= max(0, C_j - dueDates[j])
  m.constraint(
    tardiness.map((T, j) => expr`${T} >= ${completions[j]} - ${input.dueDates[j]}`)
  );

  // Objective: minimize total tardiness across all jobs
  m.objective(minimize(sum(tardiness)));
  await m.solve();

  // Reconstruct job sequence starting from dummy depot node n (rounding binary arcs for tolerance safety)
  const order: number[] = [];
  let cur = n;
  for (let k = 0; k < n; k++) {
    cur = x[cur].findIndex((v) => v !== null && Math.round(v.value!) === 1);
    order.push(cur);
  }

  return {
    order,
    completions: completions.map((v) => v.value!),
    totalTardiness: m.objectiveValue!,
  };
}
