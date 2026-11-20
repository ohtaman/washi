import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P014Input {
  budget: number;
  unitReturns: number[];
  fixedCosts: number[];
  minLevels: number[];
  maxLevels: number[];
  prerequisites: number[][];
  conjunctions: number[][];
  conflicts: number[][];
}

export interface P014Output {
  active: number[];
  levels: number[];
  netProfit: number;
}

export async function solve(input: P014Input): Promise<P014Output> {
  const n = input.unitReturns.length;
  const m = new Model("ConditionalLogicBigM");

  const active = m.binary(n, { prefix: "act" });
  const levels = m.continuous(n, { lb: 0, prefix: "lvl" });

  m.constraint(
    levels.map((lvl, i) => expr`${input.minLevels[i]} * ${active[i]} <= ${lvl}`)
  );
  m.constraint(
    levels.map((lvl, i) => expr`${lvl} <= ${input.maxLevels[i]} * ${active[i]}`)
  );
  m.constraint(expr`${sum(levels)} <= ${input.budget}`, "budget");
  m.constraint(
    input.prerequisites.map(([a, b]) => expr`${active[a]} <= ${active[b]}`)
  );
  m.constraint(
    input.conjunctions.map(
      ([a, b, c]) => expr`${active[a]} + ${active[b]} - 1 <= ${active[c]}`
    )
  );
  m.constraint(
    input.conflicts.map(([u, v]) => expr`${active[u]} + ${active[v]} <= 1`)
  );

  m.objective(
    maximize(
      expr`dot(${input.unitReturns}, ${levels}) - dot(${input.fixedCosts}, ${active})`
    )
  );
  await m.solve();

  return {
    active: active.map((v) => Math.round(v.value!) || 0),
    levels: levels.map((v) => v.value!),
    netProfit: m.objectiveValue!,
  };
}
