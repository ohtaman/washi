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

  // Physical inventory conservation
  m.constraint(
    input.demands.map((_, t) => {
      const prevInv = t === 0 ? input.initialInventory : inventory[t - 1];
      return expr`${prevInv} + ${production[t]} - ${sales[t]} - ${inventory[t]} == 0`;
    })
  );

  // Demand split across sales, backlog change, and lost sales
  m.constraint(
    input.demands.map((demand, t) => {
      const prevBack = t === 0 ? 0 : backlog[t - 1];
      return expr`${prevBack} + ${demand} - ${sales[t]} - ${lostSales[t]} - ${backlog[t]} == 0`;
    })
  );

  m.objective(
    maximize(
      expr`${input.unitPrice} * ${sum(sales)} - dot(${input.prodCosts}, ${production}) - ${input.holdCost} * ${sum(inventory)} - ${input.backorderCost} * ${sum(backlog)} - ${input.lostSalePenalty} * ${sum(lostSales)}`
    )
  );
  await m.solve();

  return {
    production: production.map((v) => v.value!),
    sales: sales.map((v) => v.value!),
    inventory: inventory.map((v) => v.value!),
    backlog: backlog.map((v) => v.value!),
    lostSales: lostSales.map((v) => v.value!),
    netProfit: m.objectiveValue!,
  };
}
