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
  // Solve via Pumpkin CP solver using global disjoint (no-overlap) constraints
  const m = new Model("JobShopCP", { solver: "pumpkin" });
  const horizon = input.durations.flat().reduce((a, b) => a + b, 0);

  // starts[j][o]: integer start time of operation o of job j in [0, horizon - duration]
  const starts = input.durations.map((jobDurs, j) =>
    jobDurs.map((d, o) => m.integer(`s_${j}_${o}`, { lb: 0, ub: horizon - d }))
  );

  // Job routing precedence: operation o must finish before operation o + 1 starts
  input.durations.forEach((jobDurs, j) => {
    for (let o = 0; o < jobDurs.length - 1; o++) {
      m.constraint(expr`${starts[j][o]} + ${jobDurs[o]} <= ${starts[j][o + 1]}`);
    }
  });

  // Machine capacity: all operations assigned to the same machine must be pairwise non-overlapping
  const numMachines = Math.max(...input.machines.flat()) + 1;
  for (let mach = 0; mach < numMachines; mach++) {
    const ops = input.machines.flatMap((jobMachs, j) =>
      jobMachs
        .map((opMach, o) =>
          opMach === mach ? { start: starts[j][o], duration: input.durations[j][o] } : null
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
    );
    if (ops.length >= 2) {
      m.constraint(disjoint(ops), `machine_${mach}`);
    }
  }

  // Objective: minimize makespan (maximum completion time across all operations)
  const completions = starts.flatMap((jobStarts, j) =>
    jobStarts.map((s, o) => expr`${s} + ${input.durations[j][o]}`)
  );
  m.objective(minimize(max(completions)));
  await m.solve();

  return {
    // Round integer values to eliminate any solver representation noise
    starts: starts.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    makespan: Math.round(m.objectiveValue!) || 0,
  };
}
