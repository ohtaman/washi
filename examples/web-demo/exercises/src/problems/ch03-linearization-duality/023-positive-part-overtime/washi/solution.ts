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

  m.constraint(expr`${sum(regular)} <= ${input.totalRegularCap}`, "total_regular");
  m.constraint(
    input.demands.map((demand, t) => expr`${shortage[t]} >= ${demand} - ${regular[t]}`)
  );

  m.objective(
    minimize(
      expr`dot(${input.regularCosts}, ${regular}) + dot(${input.overtimePenalties}, ${shortage})`
    )
  );
  await m.solve();

  return {
    regular: regular.map((v) => v.value!),
    shortage: shortage.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
