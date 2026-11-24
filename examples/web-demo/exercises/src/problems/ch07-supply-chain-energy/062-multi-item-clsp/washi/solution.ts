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

  // setups[i][t] = 1 if item i is set up in period t (binary)
  const setups = m.binary(nItems, T, { prefix: "y" });
  // production[i][t]: quantity of item i produced in period t (>= 0)
  const production = m.continuous(nItems, T, { lb: 0, prefix: "x" });
  // inventory[i][t]: ending inventory of item i at end of period t (>= 0)
  const inventory = m.continuous(nItems, T, { lb: 0, prefix: "inv" });

  // Inventory flow balance and tight big-M setup linking (bounded by remaining horizon demand) per (i, t)
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

  // Shared machine capacity (processing time + setup time) across all items in period t
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

  // Objective: minimize total setup costs and inventory holding costs
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
    // Round binary setup indicators to strip solver tolerance noise
    setups: setups.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    production: production.map((row) => row.map((v) => v.value!)),
    inventory: inventory.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
