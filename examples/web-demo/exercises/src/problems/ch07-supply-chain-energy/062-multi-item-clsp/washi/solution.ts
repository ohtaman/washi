import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P062Input {
  demands: number[][];
  setupCosts: number[];
  holdCosts: number[];
  unitTimes: number[];
  setupTimes: number[];
  capacities: number[];
}

export interface P062Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export async function solve(input: P062Input): Promise<P062Output> {
  const nItems = input.demands.length;
  const T = input.capacities.length;
  const m = new Model("MultiItemCLSP");

  const setups = m.binary(nItems, T, { prefix: "y" });
  const production = m.continuous(nItems, T, { lb: 0, prefix: "x" });
  const inventory = m.continuous(nItems, T, { lb: 0, prefix: "inv" });

  // Inventory flow balance and remaining-demand setup linking per (i, t)
  input.demands.forEach((itemDemands, i) => {
    itemDemands.forEach((demand, t) => {
      const prev = t === 0 ? 0 : inventory[i][t - 1];
      m.constraint(
        expr`${prev} + ${production[i][t]} - ${inventory[i][t]} == ${demand}`
      );
      const remDemand = itemDemands.slice(t).reduce((acc, d) => acc + d, 0);
      m.constraint(expr`${production[i][t]} <= ${remDemand} * ${setups[i][t]}`);
    });
  });

  // Shared machine capacity (processing time + setup time) per period t
  m.constraint(
    input.capacities.map((cap, t) =>
      expr`${sum(
        input.demands.map(
          (_, i) =>
            expr`${input.unitTimes[i]} * ${production[i][t]} + ${input.setupTimes[i]} * ${setups[i][t]}`
        )
      )} <= ${cap}`
    )
  );

  const totalCostExpr = sum(
    input.demands.flatMap((row, i) =>
      row.map(
        (_, t) =>
          expr`${input.setupCosts[i]} * ${setups[i][t]} + ${input.holdCosts[i]} * ${inventory[i][t]}`
      )
    )
  );
  m.objective(minimize(totalCostExpr));
  await m.solve();

  return {
    setups: setups.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    production: production.map((row) => row.map((v) => v.value!)),
    inventory: inventory.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
