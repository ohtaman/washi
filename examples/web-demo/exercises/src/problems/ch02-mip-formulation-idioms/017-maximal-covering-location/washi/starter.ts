import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P017Input {
  demands: number[];
  distances: number[][];
  coverageRadius: number;
  maxFacilities: number;
}

export interface P017Output {
  open: number[];
  covered: number[];
  totalCoveredDemand: number;
}

export async function solve(input: P017Input): Promise<P017Output> {
  const n = input.demands.length;
  const mSites = input.distances[0]?.length ?? 0;
  const m = new Model("MaximalCoveringLocation");

  const open = m.binary(mSites, { prefix: "open" });
  const covered = m.binary(n, { prefix: "cov" });

  // TODO: Limit open sites, link zone coverage to nearby open sites, maximize covered demand, and return the result.
  throw new Error("Not implemented");
}
