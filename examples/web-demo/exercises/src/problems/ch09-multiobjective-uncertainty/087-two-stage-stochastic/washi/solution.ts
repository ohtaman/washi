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
  const m = new Model("TwoStageStochastic");

  // First-stage decision: order quantities committed before demand is revealed
  const orders = m.continuous(n, { lb: 0, prefix: "x" });
  // Second-stage recourse per scenario s: unmet demand (shortage) and excess inventory (leftover)
  const shortage = input.probs.map((_, s) =>
    m.continuous(n, { lb: 0, prefix: `short_${s}` })
  );
  const leftover = input.probs.map((_, s) =>
    m.continuous(n, { lb: 0, prefix: `left_${s}` })
  );

  // First-stage warehouse capacity across all items
  m.constraint(expr`sum(${orders}) <= ${input.warehouseCap}`, "warehouse_cap");
  // Second-stage demand balance per scenario s and item j
  m.constraint(
    input.demands.flatMap((row, s) =>
      row.map(
        (d, j) => expr`${orders[j]} + ${shortage[s][j]} - ${leftover[s][j]} == ${d}`
      )
    )
  );

  // Minimize first-stage order cost plus expected second-stage shortage cost minus salvage revenue
  const stage2Expected = sum(
    input.probs.map(
      (p, s) =>
        expr`${p} * (dot(${input.shortageCosts}, ${shortage[s]}) - dot(${input.salvageValues}, ${leftover[s]}))`
    )
  );
  m.objective(minimize(expr`dot(${input.orderCosts}, ${orders}) + ${stage2Expected}`));
  await m.solve();

  return {
    orders: orders.map((v) => v.value!),
    expectedCost: m.objectiveValue!,
  };
}
