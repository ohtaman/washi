import { Model, Var, expr, maximize, minimize, solveColumnGeneration } from "@ohtaman/washi";

export interface P094Input {
  rollWidth: number;
  widths: number[];
  demands: number[];
}

export interface P094Output {
  patterns: number[][];
  counts: number[];
  totalRolls: number;
}

export async function solve(input: P094Input): Promise<P094Output> {
  const m = input.widths.length;
  const master = new Model("CuttingStockMaster");
  master.objective(minimize(0));

  for (let i = 0; i < m; i++) {
    master.constraint(expr`0 >= ${input.demands[i]}`, `demand_${i}`);
  }

  const initCols: Array<{ variable: Var; pattern: number[] }> = [];
  for (let i = 0; i < m; i++) {
    if (input.demands[i] <= 0) continue;
    const fit = Math.floor(input.rollWidth / input.widths[i]);
    const pat = Array(m).fill(0);
    pat[i] = fit;
    const variable = master.column({
      name: `init_${i}`,
      type: "Integer",
      cost: 1,
      coefficients: { [`demand_${i}`]: fit },
    });
    initCols.push({ variable, pattern: pat });
  }

  // TODO:
  // 1. Call solveColumnGeneration({ master, finalizeAsMIP: true, pricing: async ({ getDual }) => ... })
  // 2. Inside pricing, build a knapsack Model maximizing sum_i getDual(`demand_${i}`) * a[i]
  //    subject to dot(input.widths, a) <= input.rollWidth (with integer a[i] in [0, floor(rollWidth / widths[i])])
  // 3. If reduced cost 1 - sub.objectiveValue! < -1e-5, return a new ColumnProposal with meta: pattern
  // 4. Collect all positive-count patterns from initCols and result.generatedColumns and return { patterns, counts, totalRolls }
  throw new Error("Not implemented");
}
