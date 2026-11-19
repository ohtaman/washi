import { Model, expr, maximize } from "@ohtaman/washi";

export interface P001Input {
  flourCap: number;
  butterCap: number;
}

export interface P001Output {
  croissants: number;
  loaves: number;
  totalProfit: number;
}

export async function solve(input: P001Input): Promise<P001Output> {
  const m = new Model("Bakery");
  const c = m.continuous("croissants", { lb: 0 });
  const l = m.continuous("loaves", { lb: 0 });

  m.constraint(expr`2 * ${c} + 3 * ${l} <= ${input.flourCap}`, "flour");
  // TODO: Add butter constraint: c + 2 * l <= input.butterCap

  m.objective(maximize(expr`40 * ${c} + 70 * ${l}`));
  await m.solve();

  return {
    croissants: c.value!,
    loaves: l.value!,
    totalProfit: m.objectiveValue!,
  };
}
