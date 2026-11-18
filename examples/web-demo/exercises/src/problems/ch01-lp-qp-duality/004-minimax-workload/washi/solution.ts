import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P004Input {
  loads: number[];
  capacities: number[];
  allowed: number[][];
}

export async function solve(input: P004Input) {
  const nJobs = input.loads.length;
  const nServers = input.capacities.length;
  const m = new Model("MinimaxWorkload");

  const assignments = input.allowed.map((row, j) =>
    row.map((ok, s) => m.continuous({ lb: 0, ub: ok, name: `x_${j}_${s}` }))
  );
  const peak = m.continuous({ lb: 0, name: "peak" });

  for (let j = 0; j < nJobs; j++) {
    m.constraint(expr`${sum(assignments[j])} == 1`, `job_${j}`);
  }

  for (let s = 0; s < nServers; s++) {
    const colVars = assignments.map((row) => row[s]);
    m.constraint(
      expr`dot(${input.loads}, ${colVars}) <= ${input.capacities[s]} * ${peak}`,
      `srv_${s}`
    );
  }

  m.objective(minimize(peak));
  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    assignments: assignments.map((row) => row.map((v) => v.value!)),
    peakUtilization: m.objectiveValue!,
  };
}
