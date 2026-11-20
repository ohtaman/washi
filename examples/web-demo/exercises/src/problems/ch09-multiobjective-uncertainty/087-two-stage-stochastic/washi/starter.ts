import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P087Input {
  orderCosts: number[];
  shortageCosts: number[];
  salvageValues: number[];
  warehouseCap: number;
  probs: number[];
  demands: number[][];
}

export interface P087Output {
  orders: number[];
  expectedCost: number;
}

export async function solve(input: P087Input): Promise<P087Output> {
  const n = input.orderCosts.length;
  const S = input.probs.length;
  const m = new Model("TwoStageStochastic");

  const orders = m.continuous(n, { lb: 0, prefix: "x" });
  const shortage = input.probs.map((_, s) =>
    m.continuous(n, { lb: 0, prefix: `short_${s}` })
  );
  const leftover = input.probs.map((_, s) =>
    m.continuous(n, { lb: 0, prefix: `left_${s}` })
  );

  // TODO:
  // 1. Add Stage-1 warehouse capacity constraint: sum(orders) <= warehouseCap
  // 2. For each scenario s and product j, add recourse balance:
  //    orders[j] + shortage[s][j] - leftover[s][j] == demands[s][j]
  // 3. Minimize expected cost: dot(orderCosts, orders) + sum_s probs[s] * (dot(shortageCosts, shortage[s]) - dot(salvageValues, leftover[s]))
  // 4. Solve and return { orders, expectedCost }
  throw new Error("Not implemented");
}
