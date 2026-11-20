import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P078Input {
  courseSizes: number[];
  roomCapacities: number[];
  teachers: number[];
  cohorts: number[][];
  slotScores: number[][];
}

export interface P078Output {
  rooms: number[];
  slots: number[];
  totalScore: number;
}

export async function solve(input: P078Input): Promise<P078Output> {
  const C = input.courseSizes.length;
  const R = input.roomCapacities.length;
  const T = input.slotScores[0].length;
  const m = new Model("UniversityTimetabling");

  const x = Array.from({ length: C }, (_, c) =>
    Array.from({ length: R }, (_, r) =>
      Array.from({ length: T }, (_, t) => m.binary(`x_${c}_${r}_${t}`))
    )
  );

  // TODO:
  // 1. Assign each course c to exactly one compatible (room r, slot t) where courseSizes[c] <= roomCapacities[r]
  // 2. Enforce at most one course per (room r, slot t)
  // 3. For each teacher and each cohort, allow at most one course per slot t
  // 4. Maximize total slotScores, solve, and decode rooms[c], slots[c]
  throw new Error("Not implemented");
}
