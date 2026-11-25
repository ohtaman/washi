import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P064Input {
  externalDemands: number[][];
  bom: number[][];
  leadTimes: number[];
  initialInventory: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCosts: number[];
  capacities: number[];
}

export interface P064Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export async function solve(input: P064Input): Promise<P064Output> {
  const nItems = input.externalDemands.length;
  const T = input.externalDemands[0]?.length ?? 0;
  const m = new Model("MultilevelBomMrp");

  // setups[i][t] = 1 if item i is produced in period t (binary)
  const setups = m.binary(nItems, T, { prefix: "y" });
  // production[i][t]: integer batch quantity of item i started in period t (0 <= x <= capacities[i])
  const production = input.capacities.map((ub, i) =>
    Array.from({ length: T }, (_, t) => m.integer(`x_${i}_${t}`, { lb: 0, ub }))
  );
  // inventory[i][t]: ending on-hand stock of item i in period t (>= 0)
  const inventory = m.continuous(nItems, T, { lb: 0, prefix: "inv" });

  // Capacity linking and multi-level BOM + lead-time inventory balance
  input.externalDemands.forEach((extRow, i) => {
    const L = input.leadTimes[i];
    extRow.forEach((extDemand, t) => {
      // Production requires setup activation
      m.constraint(
        expr`${production[i][t]} <= ${input.capacities[i]} * ${setups[i][t]}`
      );
      const prevInv = t === 0 ? input.initialInventory[i] : inventory[i][t - 1];
      // Production started at t - L arrives as usable supply in period t
      const arrival = t >= L ? production[i][t - L] : 0;
      // Dependent demand from parent items j produced in period t
      const depTerms = input.bom[i]
        .map((ratio, j) =>
          ratio !== 0 ? expr`${ratio} * ${production[j][t]}` : null
        )
        .filter((term): term is NonNullable<typeof term> => term !== null);
      const depExpr = depTerms.length > 0 ? sum(depTerms) : 0;
      m.constraint(
        expr`${prevInv} + ${arrival} - ${depExpr} - ${inventory[i][t]} == ${extDemand}`
      );
    });
  });

  // Objective: minimize total setup, production, and inventory holding costs
  const totalCostExpr = sum(
    input.externalDemands.flatMap((row, i) =>
      row.map(
        (_, t) =>
          expr`${input.setupCosts[i]} * ${setups[i][t]} + ${input.prodCosts[i]} * ${production[i][t]} + ${input.holdCosts[i]} * ${inventory[i][t]}`
      )
    )
  );
  m.objective(minimize(totalCostExpr));
  await m.solve();

  return {
    // Round binary/integer values to strip solver tolerance noise
    setups: setups.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    production: production.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    inventory: inventory.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
