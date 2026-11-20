import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P023Input {
  demands: number[];
  minRegular: number[];
  maxRegular: number[];
  regularCosts: number[];
  overtimePenalties: number[];
  totalRegularCap: number;
}

export interface P023Output {
  regular: number[];
  shortage: number[];
  totalCost: number;
}

export async function solve(input: P023Input): Promise<P023Output> {
  const T = input.demands.length;
  const m = new Model("PositivePartOvertime");

  const regular = input.demands.map((_, t) =>
    m.continuous(`reg_${t}`, { lb: input.minRegular[t], ub: input.maxRegular[t] })
  );
  const shortage = m.continuous(T, { lb: 0, prefix: "short" });

  // TODO:
  // 1. Add aggregate regular capacity constraint: sum(regular) <= input.totalRegularCap
  // 2. Linearize positive-part shortage max(0, demands[t] - regular[t]) for each period t:
  //    shortage[t] >= input.demands[t] - regular[t]
  // 3. Minimize dot(input.regularCosts, regular) + dot(input.overtimePenalties, shortage),
  //    solve, and return { regular, shortage, totalCost }
  throw new Error("Not implemented");
}
