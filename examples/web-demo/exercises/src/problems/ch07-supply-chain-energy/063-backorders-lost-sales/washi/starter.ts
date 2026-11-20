import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P063Input {
  demands: number[];
  capacities: number[];
  prodCosts: number[];
  unitPrice: number;
  holdCost: number;
  backorderCost: number;
  lostSalePenalty: number;
  initialInventory: number;
}

export interface P063Output {
  production: number[];
  sales: number[];
  inventory: number[];
  backlog: number[];
  lostSales: number[];
  netProfit: number;
}

export async function solve(input: P063Input): Promise<P063Output> {
  const T = input.demands.length;
  const m = new Model("BackordersLostSales");

  const production = input.capacities.map((ub, t) =>
    m.continuous({ lb: 0, ub, name: `prod_${t}` })
  );
  const sales = m.continuous(T, { lb: 0, prefix: "sales" });
  const inventory = m.continuous(T, { lb: 0, prefix: "inv" });
  const backlog = input.demands.map((_, t) =>
    m.continuous({ lb: 0, ub: t === T - 1 ? 0 : Infinity, name: `back_${t}` })
  );
  const lostSales = input.demands.map((ub, t) =>
    m.continuous({ lb: 0, ub, name: `lost_${t}` })
  );

  // TODO:
  // 1. Add physical inventory balance: prevInv + production[t] - sales[t] == inventory[t]
  // 2. Add backlog/demand balance: prevBack + demands[t] - sales[t] - lostSales[t] == backlog[t]
  // 3. Maximize net profit (revenue - production - holding - backorder - lost-sale penalties),
  //    await m.solve(), and return { production, sales, inventory, backlog, lostSales, netProfit }
  throw new Error("Not implemented");
}
