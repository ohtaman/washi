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

  // TODO:
  // 1. Limit total open facilities: sum(open) <= input.maxFacilities
  // 2. For each zone i, enforce covered[i] <= sum of open[j] where distances[i][j] <= coverageRadius
  // 3. Maximize dot(input.demands, covered), solve, and return { open, covered, totalCoveredDemand }
  throw new Error("Not implemented");
}
