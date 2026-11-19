import { Model, expr, maximize } from "@ohtaman/washi";

export interface P002Input {
  milkCap: number;
  sugarCap: number;
  vanillaProfit: number;
  chocoProfit: number;
  vanillaMilk: number;
  vanillaSugar: number;
  chocoMilk: number;
  chocoSugar: number;
}

export async function solve(input: P002Input) {
  const m = new Model("TwoFlavorCreamery");
  const vanilla = m.continuous("vanilla", { lb: 0 });
  const chocolate = m.continuous("chocolate", { lb: 0 });

  m.constraint(
    expr`${input.vanillaMilk} * ${vanilla} + ${input.chocoMilk} * ${chocolate} <= ${input.milkCap}`,
    "milk"
  );

  // TODO: Add the sugar capacity constraint (`sugarUsed <= input.sugarCap`)

  m.objective(
    maximize(
      expr`${input.vanillaProfit} * ${vanilla} + ${input.chocoProfit} * ${chocolate}`
    )
  );
  await m.solve();

  return {
    vanilla: vanilla.value!,
    chocolate: chocolate.value!,
    totalProfit: m.objectiveValue!,
  };
}
