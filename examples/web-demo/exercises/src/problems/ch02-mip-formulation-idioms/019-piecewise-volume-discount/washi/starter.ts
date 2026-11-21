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

  // TODO: Enforce at most one tier per supplier, link tier quantity bounds, meet total demand, minimize cost, and return the result.
  throw new Error("Not implemented");
}
