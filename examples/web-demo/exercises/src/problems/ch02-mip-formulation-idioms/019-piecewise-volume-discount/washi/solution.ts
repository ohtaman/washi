import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P019Tier {
  minQty: number;
  maxQty: number;
  unitPrice: number;
}

export interface P019Input {
  demand: number;
  suppliers: P019Tier[][];
}

export interface P019Output {
  tierSelected: number[][];
  tierQuantities: number[][];
  totalCost: number;
}

export async function solve(input: P019Input): Promise<P019Output> {
  const m = new Model("VolumeDiscount");

  const tierSelected = input.suppliers.map((tiers, s) =>
    tiers.map((_, k) => m.binary(`y_${s}_${k}`))
  );
  const tierQuantities = input.suppliers.map((tiers, s) =>
    tiers.map((_, k) => m.continuous(`q_${s}_${k}`, { lb: 0 }))
  );

  m.constraint(tierSelected.map((row) => expr`${sum(row)} <= 1`));
  m.constraint(
    input.suppliers.flatMap((tiers, s) =>
      tiers.flatMap((tier, k) => [
        expr`${tier.minQty} * ${tierSelected[s][k]} <= ${tierQuantities[s][k]}`,
        expr`${tierQuantities[s][k]} <= ${tier.maxQty} * ${tierSelected[s][k]}`,
      ])
    )
  );
  m.constraint(expr`${sum(tierQuantities.flat())} >= ${input.demand}`, "demand");

  const totalCostExpr = sum(
    input.suppliers.flatMap((tiers, s) =>
      tiers.map((tier, k) => expr`${tier.unitPrice} * ${tierQuantities[s][k]}`)
    )
  );
  m.objective(minimize(totalCostExpr));
  await m.solve();

  return {
    tierSelected: tierSelected.map((row) => row.map((v) => Math.round(v.value!) || 0)),
    tierQuantities: tierQuantities.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
