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
  // Decision variables: continuous non-negative quantities of croissants and loaves to bake.
  const c = m.continuous("croissants", { lb: 0 });
  const l = m.continuous("loaves", { lb: 0 });

  // Resource capacity constraints for flour and butter.
  m.constraint(expr`2 * ${c} + 3 * ${l} <= ${input.flourCap}`, "flour");
  m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, "butter");

  // Objective: maximize total profit from both baked goods.
  m.objective(maximize(expr`40 * ${c} + 70 * ${l}`));
  await m.solve();

  return {
    croissants: c.value!,
    loaves: l.value!,
    totalProfit: m.objectiveValue!,
  };
}
