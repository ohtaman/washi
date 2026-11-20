import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P068Input {
  demands: number[];
  pMin: number[];
  pMax: number[];
  rampLimit: number[];
  minUp: number[];
  minDown: number[];
  startupCosts: number[];
  fuelCosts: number[];
}

export interface P068Output {
  commitment: number[][];
  generation: number[][];
  totalCost: number;
}

export async function solve(input: P068Input): Promise<P068Output> {
  const m = new Model("UnitCommitment");

  // TODO:
  // 1. Declare binary commitment u[g][t], startup v[g][t], shutdown w[g][t] in [0,1], and generation p[g][t]
  // 2. Enforce state transition v[g][t] - w[g][t] == u[g][t] - u[g][t-1] (u[g][-1] = 0),
  //    generation limits [pMin[g]*u, pMax[g]*u], min-up / min-down window inequalities, and ramp limits
  // 3. Meet hourly demands[t], minimize startup + fuel cost, await m.solve(), and return { commitment, generation, totalCost }
  throw new Error("Not implemented");
}
