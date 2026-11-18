import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P006Input {
  x: number[];
  y: number[];
  linfWeight: number;
}

export async function solve(input: P006Input) {
  const n = input.x.length;
  const m = new Model("RobustFit");

  const slope = m.continuous({ lb: -Infinity, name: "a" });
  const intercept = m.continuous({ lb: -Infinity, name: "b" });
  const absErr = m.continuous(n, { lb: 0, prefix: "e" });
  const maxErr = m.continuous({ lb: 0, name: "mErr" });

  for (let i = 0; i < n; i++) {
    const residual = expr`${slope} * ${input.x[i]} + ${intercept} - ${input.y[i]}`;
    m.constraint(expr`${absErr[i]} >= ${residual}`, `err_pos_${i}`);
    m.constraint(expr`${absErr[i]} >= -(${residual})`, `err_neg_${i}`);
    m.constraint(expr`${maxErr} >= ${absErr[i]}`, `linf_${i}`);
  }

  m.objective(minimize(expr`${sum(absErr)} + ${input.linfWeight} * ${maxErr}`));

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    slope: slope.value!,
    intercept: intercept.value!,
    objective: m.objectiveValue!,
  };
}
