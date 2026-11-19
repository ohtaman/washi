import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P010Input {
  margins: number[];
  fixedCosts: number[];
  capacities: number[];
  materialUsages: number[];
  materialCap: number;
}

export async function solve(input: P010Input) {
  const n = input.margins.length;
  const m = new Model("LineActivation");

  const open = m.binary(n, { prefix: "open" });
  const quantities = m.continuous(n, { lb: 0, prefix: "qty" });

  for (let i = 0; i < n; i++) {
    m.constraint(
      expr`${quantities[i]} - ${input.capacities[i]} * ${open[i]} <= 0`,
      `cap_link_${i}`
    );
  }
  m.constraint(
    expr`dot(${input.materialUsages}, ${quantities}) <= ${input.materialCap}`,
    "material"
  );

  m.objective(
    maximize(
      expr`dot(${input.margins}, ${quantities}) - dot(${input.fixedCosts}, ${open})`
    )
  );

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    open: open.map((v) => Math.round(v.value!)),
    quantities: quantities.map((v) => v.value!),
    netProfit: m.objectiveValue!,
  };
}
