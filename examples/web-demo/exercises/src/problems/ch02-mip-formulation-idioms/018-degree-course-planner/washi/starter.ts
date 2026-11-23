import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P018Input {
  interest: number[];
  requirements: number[][];
  caps: number[];
  prerequisites: number[][];
  timeConflicts: number[][];
}

export interface P018Output {
  take: number[];
  totalInterest: number;
}

export async function solve(input: P018Input): Promise<P018Output> {
  const n = input.interest.length;
  const m = new Model("DegreeCoursePlanner");
  const take = m.binary(n, { prefix: "course" });

  // TODO: Enforce category caps, prerequisites, and time conflicts, maximize total interest, and return the result.
  throw new Error("Not implemented");
}
