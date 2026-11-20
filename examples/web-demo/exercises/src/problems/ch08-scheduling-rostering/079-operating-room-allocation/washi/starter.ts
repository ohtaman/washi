import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P079Input {
  durations: number[];
  priorities: number[];
  compatible: number[][];
  numSessions: number;
  regularCapacity: number;
  maxOvertime: number;
  overtimeCost: number;
}

export interface P079Output {
  assignedRoom: number[];
  assignedSession: number[];
  overtime: number[][];
  netScore: number;
}

export async function solve(input: P079Input): Promise<P079Output> {
  const C = input.durations.length;
  const R = input.compatible[0].length;
  const S = input.numSessions;
  const m = new Model("OperatingRoomAllocation");

  const x = Array.from({ length: C }, (_, c) =>
    Array.from({ length: R }, (_, r) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${c}_${r}_${s}`))
    )
  );
  const overtime = Array.from({ length: R }, (_, r) =>
    Array.from({ length: S }, (_, s) =>
      m.continuous({ lb: 0, ub: input.maxOvertime, name: `ot_${r}_${s}` })
    )
  );

  // TODO:
  // 1. Schedule each case c at most once, and forbid incompatible rooms (compatible[c][r] === 0)
  // 2. Enforce block capacity: sum_c durations[c] * x[c][r][s] <= regularCapacity + overtime[r][s]
  // 3. Maximize sum(priorities * scheduled) - overtimeCost * sum(overtime), solve, and decode assignedRoom/assignedSession (-1 if unscheduled)
  throw new Error("Not implemented");
}
