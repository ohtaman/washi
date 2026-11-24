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

interface DwColumnMeta {
  k: number;
  x: number[];
}

export async function solve(input: P096Input): Promise<P096Output> {
  const K = input.profits.length;
  const master = new Model("DantzigWolfeMaster");
  // Dantzig-Wolfe master: maximize convex combination of block extreme points
  master.objective(maximize(0));

  // Linking constraint (sharedCap) and convexity constraint sum(lambda_{k,p}) == 1 per block k
  master.constraint(expr`0 <= ${input.sharedCap}`, "shared_cap");
  for (let k = 0; k < K; k++) {
    master.constraint(expr`0 == 1`, `conv_${k}`);
    // Zero-production extreme point x_k = 0 ensures initial master feasibility
    master.column({
      name: `init_${k}`,
      type: "Continuous",
      lb: 0,
      cost: 0,
      coefficients: { [`conv_${k}`]: 1 },
    });
  }

  let colCounter = 0;
  // Continuous Dantzig-Wolfe decomposition (no MIP finalization needed for LP)
  const result = await solveColumnGeneration<DwColumnMeta>({
    master,
    maxIterations: 200,
    reducedCostTolerance: 1e-6,
    finalizeAsMIP: false,
    pricing: async ({ getDual }) => {
      // Dual of shared linking constraint prices shared resource consumption
      const piShared = getDual("shared_cap");
      const proposals: Array<ColumnProposal<DwColumnMeta>> = [];

      // Solve independent pricing subproblem for each block k
      for (let k = 0; k < K; k++) {
        const muK = getDual(`conv_${k}`);
        const J = input.profits[k].length;
        const sub = new Model(`BlockPricing_${k}`);
        // Block-local production quantities bounded by [0, productCaps[k][j]]
        const x = input.productCaps[k].map((cap, j) =>
          sub.continuous(`x_${k}_${j}`, { lb: 0, ub: cap })
        );

        // Pricing objective: maximize sum_j (profit[k][j] - piShared * sharedUsage[k][j]) * x[j]
        let reducedObj = expr`0`;
        let localExpr = expr`0`;
        for (let j = 0; j < J; j++) {
          const reducedUnit = input.profits[k][j] - piShared * input.sharedUsages[k][j];
          reducedObj = reducedObj.add(x[j].mul(reducedUnit));
          localExpr = localExpr.add(x[j].mul(input.localUsages[k][j]));
        }

        sub.objective(maximize(reducedObj));
        // Enforce block-local capacity constraint inside the subproblem
        sub.constraint(expr`${localExpr} <= ${input.localCaps[k]}`, "local_cap");

        const status = await sub.solve();
        if (status !== "Optimal") continue;

        // Positive reduced cost (subObj - mu_k > 0) improves the maximization master
        const rc = (sub.objectiveValue ?? 0) - muK;
        if (rc <= 1e-6) continue;

        colCounter++;
        const xVals = x.map((v) => Math.max(0, v.value ?? 0));
        let colProfit = 0;
        let colShared = 0;
        for (let j = 0; j < J; j++) {
          colProfit += input.profits[k][j] * xVals[j];
          colShared += input.sharedUsages[k][j] * xVals[j];
        }

        proposals.push({
          name: `col_${k}_${colCounter}`,
          type: "Continuous",
          lb: 0,
          cost: colProfit,
          coefficients: {
            shared_cap: colShared,
            [`conv_${k}`]: 1,
          },
          reducedCost: rc,
          meta: { k, x: xVals },
        });
      }

      return proposals.length > 0 ? proposals : null;
    },
  });

  // Reconstruct original block allocations via convex combination x_k = sum_p lambda_{k,p} * x_{k,p}
  const allocations = input.profits.map((row) => Array(row.length).fill(0));
  for (const { variable, proposal } of result.generatedColumns) {
    const lambda = Math.max(0, result.values[variable.name] ?? 0);
    if (lambda <= 1e-9 || !proposal.meta) continue;
    const { k, x } = proposal.meta;
    for (let j = 0; j < x.length; j++) {
      allocations[k][j] += lambda * x[j];
    }
  }

  let totalProfit = 0;
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < allocations[k].length; j++) {
      if (allocations[k][j] < 1e-9) allocations[k][j] = 0;
      totalProfit += input.profits[k][j] * allocations[k][j];
    }
  }

  return { allocations, totalProfit };
}
