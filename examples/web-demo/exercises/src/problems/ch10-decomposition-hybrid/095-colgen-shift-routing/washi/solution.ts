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

  let genCounter = 0;
  const result = await solveColumnGeneration<number[]>({
    master,
    maxIterations: 100,
    reducedCostTolerance: 1e-5,
    finalizeAsMIP: true,
    pricing: async ({ getDual }) => {
      const sub = new Model("ShiftPricing");
      const a = sub.binary(D, { prefix: "a" });
      let netGain = expr`0`;
      for (let d = 0; d < D; d++) {
        netGain = netGain.add(a[d].mul(getDual(`demand_${d}`) - input.shiftCosts[d]));
      }
      sub.objective(maximize(netGain));
      sub.constraint(expr`sum(${a}) >= 1`, "nonempty");
      sub.constraint(expr`sum(${a}) <= ${input.maxWorkDays}`, "max_work");

      for (let t = 0; t <= D - (input.maxConsecutive + 1); t++) {
        sub.constraint(
          expr`sum(${a.slice(t, t + input.maxConsecutive + 1)}) <= ${input.maxConsecutive}`,
          `consec_${t}`
        );
      }

      const status = await sub.solve();
      if (status !== "Optimal") return null;

      const reducedCost = input.baseCost - (sub.objectiveValue ?? 0);
      if (reducedCost >= -1e-5) return null;

      genCounter++;
      const pat = a.map((v) => Math.round(v.value ?? 0) || 0);
      const cost =
        input.baseCost + pat.reduce((acc, v, d) => acc + v * input.shiftCosts[d], 0);
      const coeffs: Record<string, number> = {};
      for (let d = 0; d < D; d++) {
        if (pat[d] > 0) coeffs[`demand_${d}`] = 1;
      }

      return {
        name: `gen_${genCounter}`,
        type: "Integer",
        cost,
        coefficients: coeffs,
        reducedCost,
        meta: pat,
      };
    },
  });

  const selectedColumns: number[][] = [];
  const counts: number[] = [];

  for (const { variable, pattern } of initCols) {
    const cnt = Math.round(result.values[variable.name] ?? 0) || 0;
    if (cnt > 0) {
      selectedColumns.push(pattern);
      counts.push(cnt);
    }
  }
  for (const { variable, proposal } of result.generatedColumns) {
    const cnt = Math.round(result.values[variable.name] ?? 0) || 0;
    if (cnt > 0 && proposal.meta) {
      selectedColumns.push(proposal.meta);
      counts.push(cnt);
    }
  }

  return {
    selectedColumns,
    counts,
    totalCost: Math.round(result.objectiveValue ?? 0) || 0,
  };
}
