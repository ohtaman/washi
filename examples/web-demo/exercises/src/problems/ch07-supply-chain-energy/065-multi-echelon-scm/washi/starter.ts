import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P065Input {
  plantFixedCosts: number[];
  plantCaps: number[];
  dcFixedCosts: number[];
  dcCaps: number[];
  demands: number[];
  plantDcCosts: number[][];
  dcCustomerCosts: number[][];
}

export interface P065Output {
  openPlants: number[];
  openDcs: number[];
  plantToDc: number[][];
  dcToCustomer: number[][];
  totalCost: number;
}

export async function solve(input: P065Input): Promise<P065Output> {
  const nPlants = input.plantCaps.length;
  const nDcs = input.dcCaps.length;
  const nCusts = input.demands.length;
  const m = new Model("MultiEchelonSCM");

  const openPlants = m.binary(nPlants, { prefix: "plant" });
  const openDcs = m.binary(nDcs, { prefix: "dc" });
  const plantToDc = m.continuous(nPlants, nDcs, { lb: 0, prefix: "p2d" });
  const dcToCustomer = m.continuous(nDcs, nCusts, { lb: 0, prefix: "d2c" });

  // TODO:
  // 1. Bound outbound plant flow by plantCaps[p] * openPlants[p]
  // 2. Bound DC throughput by dcCaps[d] * openDcs[d] and enforce inflow == outflow at every DC
  // 3. Satisfy customer demands[c], minimize fixed + transport costs, await m.solve(), and return outputs
  throw new Error("Not implemented");
}
