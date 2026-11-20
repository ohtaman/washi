import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P089Input {
  profits: number[];
  nominalUsages: number[];
  deviations: number[];
  maxUnits: number[];
  capacityCap: number;
  gamma: number;
}

export interface P089Output {
  quantities: number[];
  totalProfit: number;
}

export async function solve(input: P089Input): Promise<P089Output> {
  const n = input.profits.length;
  const m = new Model("BertsimasSimRobust");

  const x = input.maxUnits.map((ub, j) =>
    m.continuous({ lb: 0, ub, name: `x_${j}` })
  );
  const z = m.continuous("z", { lb: 0 });
  const p = m.continuous(n, { lb: 0, prefix: "p" });

  // TODO:
  // 1. Add dual protection constraints: z + p[j] >= deviations[j] * x[j] for each j
  // 2. Add robust capacity constraint: dot(nominalUsages, x) + gamma * z + sum(p) <= capacityCap
  // 3. Maximize dot(profits, x), solve, and return { quantities, totalProfit }
  throw new Error("Not implemented");
}
