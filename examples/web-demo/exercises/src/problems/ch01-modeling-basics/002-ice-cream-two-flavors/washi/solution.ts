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

export interface P002Output {
  vanilla: number;
  chocolate: number;
  totalProfit: number;
}

export async function solve(input: P002Input): Promise<P002Output> {
  const m = new Model("TwoFlavorCreamery");
  const vanilla = m.continuous("vanilla", { lb: 0 });
  const chocolate = m.continuous("chocolate", { lb: 0 });

  m.constraint(
    expr`${input.vanillaMilk} * ${vanilla} + ${input.chocoMilk} * ${chocolate} <= ${input.milkCap}`,
    "milk"
  );
  m.constraint(
    expr`${input.vanillaSugar} * ${vanilla} + ${input.chocoSugar} * ${chocolate} <= ${input.sugarCap}`,
    "sugar"
  );

  m.objective(
    maximize(
      expr`${input.vanillaProfit} * ${vanilla} + ${input.chocoProfit} * ${chocolate}`
    )
  );
  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    vanilla: vanilla.value!,
    chocolate: chocolate.value!,
    totalProfit: m.objectiveValue!,
  };
}
