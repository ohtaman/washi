import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P021Input {
  weights: number[];
  compatible: number[][];
}

export interface P021Output {
  assignments: number[][];
  peakLoad: number;
}

export async function solve(input: P021Input): Promise<P021Output> {
  const nServers = input.compatible[0].length;
  const m = new Model("MinimaxLoadBalancing");

  // Decision variables: fractional job-to-server assignments[i][j] in [0, compatible[i][j]]
  // (ub=0 disables incompatible pairs) and auxiliary epigraph variable peak >= 0.
  const assignments = input.compatible.map((row, i) =>
    row.map((allowed, j) => m.continuous(`x_${i}_${j}`, { lb: 0, ub: allowed }))
  );
  const peak = m.continuous("peak", { lb: 0 });

  // Each job must be fully assigned across compatible servers.
  m.constraint(assignments.map((row) => expr`${sum(row)} == 1`));
  // Minimax linearization: peak bounds the total weighted load on every server j.
  m.constraint(
    Array.from({ length: nServers }, (_, j) => {
      const serverLoad = sum(
        input.weights.map((w, i) => expr`${w} * ${assignments[i][j]}`)
      );
      return expr`${serverLoad} <= ${peak}`;
    })
  );

  // Objective: minimize the maximum server load.
  m.objective(minimize(peak));
  await m.solve();

  return {
    assignments: assignments.map((row) => row.map((v) => v.value!)),
    peakLoad: m.objectiveValue!,
  };
}
