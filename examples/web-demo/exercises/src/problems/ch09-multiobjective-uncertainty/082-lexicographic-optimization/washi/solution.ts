import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P082Input {
  coverage: number[];
  crews: number[];
  opCosts: number[];
  maxCrews: number;
  targetDemand: number;
  slack: number;
}

export interface P082Output {
  selected: number[];
  obj1: number;
  obj2: number;
}

export async function solve(input: P082Input): Promise<P082Output> {
  const n = input.coverage.length;

  // Stage 1: minimize primary unmet demand shortfall
  const m1 = new Model("LexicographicStage1");
  const x1 = m1.binary(n, { prefix: "x" });
  const shortfall1 = m1.continuous("shortfall", { lb: 0 });

  m1.constraint(expr`dot(${input.crews}, ${x1}) <= ${input.maxCrews}`, "crew_cap");
  m1.constraint(
    expr`dot(${input.coverage}, ${x1}) + ${shortfall1} >= ${input.targetDemand}`,
    "demand_cover"
  );
  m1.objective(minimize(shortfall1));
  await m1.solve();
  const bestObj1 = m1.objectiveValue!;

  // Stage 2: lock Stage 1 within allowed slack and minimize secondary operating cost
  const m2 = new Model("LexicographicStage2");
  const x2 = m2.binary(n, { prefix: "x" });

  m2.constraint(expr`dot(${input.crews}, ${x2}) <= ${input.maxCrews}`, "crew_cap");
  m2.constraint(
    expr`dot(${input.coverage}, ${x2}) >= ${input.targetDemand - (bestObj1 + input.slack) - 1e-6}`,
    "stage1_lock"
  );
  m2.objective(minimize(expr`dot(${input.opCosts}, ${x2})`));
  await m2.solve();

  const selected = x2.map((v) => Math.round(v.value!) || 0);
  const covered = selected.reduce((acc, bit, i) => acc + input.coverage[i] * bit, 0);

  return {
    selected,
    obj1: Math.max(0, input.targetDemand - covered),
    obj2: m2.objectiveValue!,
  };
}
