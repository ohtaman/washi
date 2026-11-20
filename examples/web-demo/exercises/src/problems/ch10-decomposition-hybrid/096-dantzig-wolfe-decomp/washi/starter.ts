import { Model, ColumnProposal, expr, maximize, solveColumnGeneration } from "@ohtaman/washi";

export interface P096Input {
  profits: number[][];
  localUsages: number[][];
  localCaps: number[];
  sharedUsages: number[][];
  sharedCap: number;
  productCaps: number[][];
}

export interface P096Output {
  allocations: number[][];
  totalProfit: number;
}

export async function solve(input: P096Input): Promise<P096Output> {
  const K = input.profits.length;
  const master = new Model("DantzigWolfeMaster");
  master.objective(maximize(0));

  master.constraint(expr`0 <= ${input.sharedCap}`, "shared_cap");
  for (let k = 0; k < K; k++) {
    master.constraint(expr`0 == 1`, `conv_${k}`);
    master.column({
      name: `init_${k}`,
      type: "Continuous",
      lb: 0,
      cost: 0,
      coefficients: { [`conv_${k}`]: 1 },
    });
  }

  // TODO:
  // 1. Run solveColumnGeneration<{ k: number; x: number[] }>({ master, finalizeAsMIP: false, pricing: ... })
  // 2. Inside pricing({ getDual }), read piShared = getDual("shared_cap") and convDual = getDual(`conv_${k}`).
  //    For each division k, solve its independent LP block:
  //      max sum_j (profits[k][j] - piShared * sharedUsages[k][j]) * x[j]
  //      s.t. 0 <= x[j] <= productCaps[k][j], sum_j localUsages[k][j] * x[j] <= localCaps[k]
  //    If reducedProfit = sub.objectiveValue! - convDual > 1e-6, return a ColumnProposal for division k.
  // 3. Reconstruct allocations[k][j] as the convex combination sum_p values[col] * proposal.meta.x[j].
  throw new Error("Not implemented");
}
