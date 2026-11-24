import { Model, Var, dot, expr, maximize, minimize, solveColumnGeneration } from "@ohtaman/washi";

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
  // Master objective minimizes total stock rolls used (columns added dynamically with cost 1)
  master.objective(minimize(0));

  // Demand constraints for each item width i (RHS populated by column coefficients)
  for (let i = 0; i < m; i++) {
    master.constraint(expr`0 >= ${input.demands[i]}`, `demand_${i}`);
  }

  // Seed Restricted Master Problem (RMP) with homogeneous single-width patterns for initial feasibility
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

  let genCounter = 0;
  // Gilmore-Gomory column generation: solve LP master, price new patterns, then finalize as integer MIP
  const result = await solveColumnGeneration<number[]>({
    master,
    maxIterations: 100,
    reducedCostTolerance: 1e-5,
    finalizeAsMIP: true,
    pricing: async ({ getDual }) => {
      // Knapsack pricing subproblem: find a feasible cutting pattern maximizing dual value
      const sub = new Model("KnapsackPricing");
      const a = input.widths.map((w, i) =>
        sub.integer(`a_${i}`, { lb: 0, ub: Math.floor(input.rollWidth / w) })
      );
      const duals = input.widths.map((_, i) => getDual(`demand_${i}`));
      sub.objective(maximize(expr`dot(${duals}, ${a})`));
      sub.constraint(expr`dot(${input.widths}, ${a}) <= ${input.rollWidth}`, "roll_width");

      const status = await sub.solve();
      if (status !== "Optimal") return null;

      // Reduced cost = 1 - sum(dual_i * a_i); stop if no negative reduced cost pattern exists
      const reducedCost = 1 - (sub.objectiveValue ?? 0);
      if (reducedCost >= -1e-5) return null;

      genCounter++;
      // Round integer pattern counts from pricing subproblem
      const pat = a.map((v) => Math.round(v.value ?? 0) || 0);
      const coeffs: Record<string, number> = {};
      for (let i = 0; i < m; i++) {
        if (pat[i] > 0) coeffs[`demand_${i}`] = pat[i];
      }

      return {
        name: `gen_${genCounter}`,
        type: "Integer",
        cost: 1,
        coefficients: coeffs,
        reducedCost,
        meta: pat,
      };
    },
  });

  const patterns: number[][] = [];
  const counts: number[] = [];

  for (const { variable, pattern } of initCols) {
    const cnt = Math.round(result.values[variable.name] ?? 0) || 0;
    if (cnt > 0) {
      patterns.push(pattern);
      counts.push(cnt);
    }
  }
  for (const { variable, proposal } of result.generatedColumns) {
    const cnt = Math.round(result.values[variable.name] ?? 0) || 0;
    if (cnt > 0 && proposal.meta) {
      patterns.push(proposal.meta);
      counts.push(cnt);
    }
  }

  return {
    patterns,
    counts,
    totalRolls: counts.reduce((acc, c) => acc + c, 0),
  };
}
