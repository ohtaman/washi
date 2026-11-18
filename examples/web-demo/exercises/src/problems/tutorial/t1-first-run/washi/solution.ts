import { Model, expr, maximize } from "@ohtaman/washi";

export interface T1Input {
  flourCap: number;
  butterCap: number;
  croissantProfit: number;
  loafProfit: number;
  croissantFlour: number;
  croissantButter: number;
  loafFlour: number;
  loafButter: number;
}

export async function solve(input: T1Input) {
  const m = new Model("Bakery");
  const c = m.continuous("croissants", { lb: 0 });
  const l = m.continuous("loaves", { lb: 0 });

  m.constraint(
    expr`${input.croissantFlour} * ${c} + ${input.loafFlour} * ${l} <= ${input.flourCap}`,
    "flour"
  );
  m.constraint(
    expr`${input.croissantButter} * ${c} + ${input.loafButter} * ${l} <= ${input.butterCap}`,
    "butter"
  );

  m.objective(maximize(expr`${input.croissantProfit} * ${c} + ${input.loafProfit} * ${l}`));

  await m.solve();
  return {
    croissants: c.value!,
    loaves: l.value!,
    totalProfit: m.objectiveValue!,
  };
}
