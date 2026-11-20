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
  const horizon =
    input.processingTimes.reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * maxSetup;
  const m = new Model("SequenceDependentSetups");

  const x = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i === j ? null : m.binary(`x_${i}_${j}`)
    )
  );
  const completions = input.processingTimes.map((p, j) =>
    m.continuous({ lb: p, ub: horizon, name: `C_${j}` })
  );
  const tardiness = m.continuous(n, { lb: 0, prefix: "T" });

  // TODO:
  // 1. Add Hamiltonian path flow conservation (out-degree == 1 and in-degree == 1 for nodes 0..n)
  // 2. Propagate completion times: C_j >= C_i + setupMatrix[i][j] + p_j - M * (1 - x_ij) with M = horizon + maxSetup
  // 3. Link tardiness[j] >= completions[j] - dueDates[j], minimize sum(tardiness), solve, and reconstruct order from dummy depot n
  throw new Error("Not implemented");
}
