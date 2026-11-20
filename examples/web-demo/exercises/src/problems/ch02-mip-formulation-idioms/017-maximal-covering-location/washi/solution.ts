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

  m.constraint(expr`${sum(open)} <= ${input.maxFacilities}`, "max_facilities");
  m.constraint(
    covered.map((cov, i) =>
      expr`${cov} <= ${sum(open.filter((_, j) => input.distances[i][j] <= input.coverageRadius))}`
    )
  );

  m.objective(maximize(expr`dot(${input.demands}, ${covered})`));
  await m.solve();

  return {
    open: open.map((v) => Math.round(v.value!) || 0),
    covered: covered.map((v) => Math.round(v.value!) || 0),
    totalCoveredDemand: m.objectiveValue!,
  };
}
