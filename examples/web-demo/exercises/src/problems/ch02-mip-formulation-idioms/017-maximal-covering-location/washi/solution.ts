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

  // Decision variables: binary open[j] (facility built at site j) and covered[i] (demand node i is covered).
  const open = m.binary(mSites, { prefix: "open" });
  const covered = m.binary(n, { prefix: "cov" });

  // Limit total number of open facilities.
  m.constraint(expr`${sum(open)} <= ${input.maxFacilities}`, "max_facilities");
  // Coverage linking: node i can be covered only if at least one facility within coverageRadius is open.
  m.constraint(
    covered.map((cov, i) =>
      expr`${cov} <= ${sum(open.filter((_, j) => input.distances[i][j] <= input.coverageRadius))}`
    )
  );

  // Objective: maximize total covered demand.
  m.objective(maximize(expr`dot(${input.demands}, ${covered})`));
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    open: open.map((v) => Math.round(v.value!) || 0),
    covered: covered.map((v) => Math.round(v.value!) || 0),
    totalCoveredDemand: m.objectiveValue!,
  };
}
