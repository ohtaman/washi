import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P001Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export async function solve(input: P001Input) {
  const nProducts = input.margins.length;
  const m = new Model("IceCreamMix");
  const quantities = m.continuous(nProducts, { lb: 0, prefix: "q" });

  for (let k = 0; k < input.capacities.length; k++) {
    m.constraint(
      expr`dot(${input.usages[k]}, ${quantities}) <= ${input.capacities[k]}`,
      `resource_${k}`
    );
  }

  m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    quantities: quantities.map((v) => v.value!),
    totalProfit: m.objectiveValue!,
  };
}
