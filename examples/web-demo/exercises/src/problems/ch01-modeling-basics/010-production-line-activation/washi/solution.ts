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

  // Decision variables: binary line activation open[i] and continuous production quantities[i] >= 0.
  const open = m.binary(n, { prefix: "open" });
  const quantities = m.continuous(n, { lb: 0, prefix: "qty" });

  // Big-M linking constraints: production on line i is allowed up to capacities[i] only when open[i] = 1.
  m.constraint(
    quantities.map((qty, i) => expr`${qty} <= ${input.capacities[i]} * ${open[i]}`)
  );
  // Shared raw material limit across all lines.
  m.constraint(
    expr`dot(${input.materialUsages}, ${quantities}) <= ${input.materialCap}`,
    "material"
  );

  // Objective: maximize net profit (unit margins minus fixed activation costs).
  m.objective(
    maximize(
      expr`dot(${input.margins}, ${quantities}) - dot(${input.fixedCosts}, ${open})`
    )
  );
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    open: open.map((v) => Math.round(v.value!) || 0),
    quantities: quantities.map((v) => v.value!),
    netProfit: m.objectiveValue!,
  };
}
