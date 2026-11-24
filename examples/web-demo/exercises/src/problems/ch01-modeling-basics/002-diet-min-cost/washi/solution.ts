import { Model, expr, minimize } from "@ohtaman/washi";

export interface P002Input {
  minProtein: number;
  minFiber: number;
}

export interface P002Output {
  oats: number;
  beans: number;
  totalCost: number;
}

export async function solve(input: P002Input): Promise<P002Output> {
  const m = new Model("DietBlend");
  // Decision variables: continuous non-negative servings of oats and beans.
  const oats = m.continuous("oats", { lb: 0 });
  const beans = m.continuous("beans", { lb: 0 });

  // Minimum daily nutritional requirements for protein and fiber.
  m.constraint(expr`2 * ${oats} + ${beans} >= ${input.minProtein}`, "protein");
  m.constraint(expr`${oats} + 3 * ${beans} >= ${input.minFiber}`, "fiber");

  // Objective: minimize total ingredient cost.
  m.objective(minimize(expr`30 * ${oats} + 50 * ${beans}`));
  await m.solve();

  return {
    oats: oats.value!,
    beans: beans.value!,
    totalCost: m.objectiveValue!,
  };
}
