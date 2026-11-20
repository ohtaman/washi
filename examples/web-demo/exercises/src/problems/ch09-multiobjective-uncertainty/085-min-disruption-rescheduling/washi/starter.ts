import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P085Input {
  baseline: number[][];
  unavailable: number[][];
  demands: number[];
  maxShifts: number[];
  workerCosts: number[];
  disruptionWeight: number;
}

export interface P085Output {
  schedule: number[][];
  hammingDistance: number;
  totalObjective: number;
}

export async function solve(input: P085Input): Promise<P085Output> {
  const mWorkers = input.baseline.length;
  const nSlots = input.demands.length;
  const m = new Model("MinDisruptionRescheduling");

  const x = input.baseline.map((row, i) =>
    row.map((_, t) => m.binary(`x_${i}_${t}`))
  );

  // TODO:
  // 1. Forbid unavailable slots: x[i][t] == 0 whenever input.unavailable[i][t] === 1
  // 2. Enforce exact staffing demands[t] per slot and maxShifts[i] per worker
  // 3. Minimize disruptionWeight * HammingDistance + workerCosts, where each cell's flip term is
  //    (1 - baseline[i][t]) * x[i][t] + baseline[i][t] * (1 - x[i][t])
  // 4. Solve and return { schedule, hammingDistance, totalObjective }
  throw new Error("Not implemented");
}
