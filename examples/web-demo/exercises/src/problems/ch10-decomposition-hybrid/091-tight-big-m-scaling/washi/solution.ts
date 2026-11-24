import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P091Input {
  fixedCosts: number[];
  unitCosts: number[];
  capacities: number[];
  demand: number;
}

export interface P091Output {
  open: number[];
  quantities: number[];
  totalCost: number;
  lpBound: number;
}

export async function solve(input: P091Input): Promise<P091Output> {
  const n = input.fixedCosts.length;
  const m = new Model("TightBigMProduction");

  // Binary facility-open indicators and continuous production quantities capped by min(cap, demand)
  const open = m.binary(n, { prefix: "open" });
  const quantities = input.capacities.map((cap, i) =>
    m.continuous(`qty_${i}`, { lb: 0, ub: Math.min(cap, input.demand) })
  );

  // Tight Big-M linking: using min(cap[i], demand) instead of an arbitrary large M strengthens LP relaxation
  m.constraint(
    quantities.map((qty, i) => {
      const tightM = Math.min(input.capacities[i], input.demand);
      return expr`${qty} <= ${tightM} * ${open[i]}`;
    })
  );
  // Total production must satisfy demand
  m.constraint(expr`sum(${quantities}) >= ${input.demand}`, "demand");

  // Minimize fixed opening costs plus variable production costs
  m.objective(
    minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${quantities})`)
  );

  // Solve LP relaxation first to record the tightened LP lower bound
  await m.relax();
  const lpBound = m.objectiveValue!;

  // Solve the full MIP and round binary indicators
  await m.solve();

  return {
    open: open.map((v) => Math.round(v.value!) || 0),
    quantities: quantities.map((v) => v.value!),
    totalCost: m.objectiveValue!,
    lpBound,
  };
}
