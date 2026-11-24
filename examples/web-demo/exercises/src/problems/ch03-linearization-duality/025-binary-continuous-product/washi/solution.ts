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

  // Decision variables: binary b[i] (discount contract active), continuous x[i] in [minOrders[i], maxOrders[i]],
  // and auxiliary continuous z[i] in [0, maxOrders[i]] representing the bilinear product b[i] * x[i].
  const b = m.binary(n, { prefix: "b" });
  const x = input.minOrders.map((lb, i) =>
    m.continuous(`x_${i}`, { lb, ub: input.maxOrders[i] })
  );
  const z = input.maxOrders.map((ub, i) =>
    m.continuous(`z_${i}`, { lb: 0, ub })
  );

  // Total order quantity must meet totalDemand.
  m.constraint(expr`${sum(x)} >= ${input.totalDemand}`, "total_demand");
  // Glover's linearization of z_i = b_i * x_i for x_i in [L, U]:
  // forces z_i = 0 when b_i = 0, and z_i = x_i when b_i = 1.
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

  // Objective: minimize base procurement costs plus contract fees minus linearized volume discounts.
  m.objective(
    minimize(
      expr`dot(${input.baseCosts}, ${x}) + dot(${input.contractFees}, ${b}) - dot(${input.discounts}, ${z})`
    )
  );
  await m.solve();

  // Round binary indicators to eliminate solver tolerance noise and normalize -0 to 0.
  return {
    b: b.map((v) => Math.round(v.value!) || 0),
    x: x.map((v) => v.value!),
    z: z.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
