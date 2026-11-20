import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P025Input {
  minOrders: number[];
  maxOrders: number[];
  baseCosts: number[];
  discounts: number[];
  contractFees: number[];
  totalDemand: number;
}

export interface P025Output {
  b: number[];
  x: number[];
  z: number[];
  totalCost: number;
}

export async function solve(input: P025Input): Promise<P025Output> {
  const n = input.minOrders.length;
  const m = new Model("GloverProduct");

  const b = m.binary(n, { prefix: "b" });
  const x = input.minOrders.map((lb, i) =>
    m.continuous(`x_${i}`, { lb, ub: input.maxOrders[i] })
  );
  const z = input.maxOrders.map((ub, i) =>
    m.continuous(`z_${i}`, { lb: 0, ub })
  );

  m.constraint(expr`${sum(x)} >= ${input.totalDemand}`, "total_demand");
  m.constraint(
    input.minOrders.flatMap((L, i) => {
      const U = input.maxOrders[i];
      return [
        expr`${z[i]} >= ${L} * ${b[i]}`,
        expr`${z[i]} <= ${U} * ${b[i]}`,
        expr`${z[i]} >= ${x[i]} - ${U} * (1 - ${b[i]})`,
        expr`${z[i]} <= ${x[i]} - ${L} * (1 - ${b[i]})`,
      ];
    })
  );

  m.objective(
    minimize(
      expr`dot(${input.baseCosts}, ${x}) + dot(${input.contractFees}, ${b}) - dot(${input.discounts}, ${z})`
    )
  );
  await m.solve();

  return {
    b: b.map((v) => Math.round(v.value!) || 0),
    x: x.map((v) => v.value!),
    z: z.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
