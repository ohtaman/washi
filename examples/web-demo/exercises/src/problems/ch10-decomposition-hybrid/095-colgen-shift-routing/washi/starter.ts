import { Model, Var, expr, maximize, minimize, solveColumnGeneration, sum } from "@ohtaman/washi";

export interface P095Input {
  demands: number[];
  shiftCosts: number[];
  baseCost: number;
  maxConsecutive: number;
  maxWorkDays: number;
}

export interface P095Output {
  selectedColumns: number[][];
  counts: number[];
  totalCost: number;
}

export async function solve(input: P095Input): Promise<P095Output> {
  const D = input.demands.length;
  const master = new Model("ShiftRosteringMaster");
  master.objective(minimize(0));

  for (let d = 0; d < D; d++) {
    master.constraint(expr`0 >= ${input.demands[d]}`, `demand_${d}`);
  }

  const initCols: Array<{ variable: Var; pattern: number[] }> = [];
  for (let d = 0; d < D; d++) {
    if (input.demands[d] <= 0) continue;
    const pat = Array(D).fill(0);
    pat[d] = 1;
    const variable = master.column({
      name: `init_${d}`,
      type: "Integer",
      cost: input.baseCost + input.shiftCosts[d],
      coefficients: { [`demand_${d}`]: 1 },
    });
    initCols.push({ variable, pattern: pat });
  }

  // TODO:
  // 1. Call solveColumnGeneration({ master, finalizeAsMIP: true, pricing: async ({ getDual }) => ... })
  // 2. Inside pricing, build a binary MIP subproblem over D days (a[d] in {0, 1}):
  //    - 1 <= sum(a) <= input.maxWorkDays
  //    - Consecutive run limits: for every window of length (maxConsecutive + 1), sum <= maxConsecutive
  //    - Maximize sum_d (getDual(`demand_${d}`) - input.shiftCosts[d]) * a[d]
  //    - If reducedCost = input.baseCost - sub.objectiveValue! < -1e-5, return a ColumnProposal with meta: pattern
  // 3. Collect all positive-count patterns and return { selectedColumns, counts, totalCost }
  throw new Error("Not implemented");
}
