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

  m.constraint(
    input.caps.map((cap, k) => expr`dot(${input.requirements[k]}, ${take}) <= ${cap}`)
  );
  m.constraint(
    input.prerequisites.map(([prereq, course]) => expr`${take[course]} <= ${take[prereq]}`)
  );
  m.constraint(
    input.timeConflicts.map(([a, b]) => expr`${take[a]} + ${take[b]} <= 1`)
  );

  m.objective(maximize(expr`dot(${input.interest}, ${take})`));
  await m.solve();

  return {
    take: take.map((v) => Math.round(v.value!) || 0),
    totalInterest: m.objectiveValue!,
  };
}
