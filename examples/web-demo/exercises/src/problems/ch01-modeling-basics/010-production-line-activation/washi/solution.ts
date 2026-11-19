import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P010Input {
  margins: number[];
  fixedCosts: number[];
  capacities: number[];
  materialUsages: number[];
  materialCap: number;
}

export interface P010Output {
  open: number[];
  quantities: number[];
  netProfit: number;
}

export async function solve(input: P010Input): Promise<P010Output> {
  const n = input.margins.length;
  const m = new Model("LineActivation");

  const open = m.binary(n, { prefix: "open" });
  const quantities = m.continuous(n, { lb: 0, prefix: "qty" });

  m.constraint(
    quantities.map((qty, i) => expr`${qty} <= ${input.capacities[i]} * ${open[i]}`)
  );
  m.constraint(
    expr`dot(${input.materialUsages}, ${quantities}) <= ${input.materialCap}`,
    "material"
  );

  m.objective(
    maximize(
      expr`dot(${input.margins}, ${quantities}) - dot(${input.fixedCosts}, ${open})`
    )
  );
  await m.solve();

  return {
    open: open.map((v) => Math.round(v.value!) || 0),
    quantities: quantities.map((v) => v.value!),
    netProfit: m.objectiveValue!,
  };
}
