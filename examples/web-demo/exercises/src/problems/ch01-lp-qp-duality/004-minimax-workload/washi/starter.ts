import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P004Input {
  loads: number[];
  capacities: number[];
  allowed: number[][];
}

export async function solve(input: P004Input) {
  const nJobs = input.loads.length;
  const nServers = input.capacities.length;
  const m = new Model("MinimaxWorkload");

  const assignments = input.allowed.map((row, j) =>
    row.map((ok, s) => m.continuous({ lb: 0, ub: ok, name: `x_${j}_${s}` }))
  );
  const peak = m.continuous({ lb: 0, name: "peak" });

  // TODO:
  // 1. Add sum_s assignments[j][s] == 1 for every job j
  // 2. Add epigraph constraint per server s: serverLoad <= capacities[s] * peak
  // 3. Minimize peak and return { assignments, peakUtilization }
  throw new Error("Not implemented");
}
