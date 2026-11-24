import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P082Input {
  valuations: number[][];
  totalRent: number;
}

export interface P082Output {
  assignment: number[];
  rents: number[];
  totalValuation: number;
  minSurplus: number;
}

export async function solve(input: P082Input): Promise<P082Output> {
  const n = input.valuations.length;

  // Stage 1: MIP to find a welfare-maximizing room assignment
  const m1 = new Model("ShareHouseStage1");
  // x[i][r] = 1 if roommate i is assigned to room r
  const x = input.valuations.map((_, i) => m1.binary(n, { prefix: `x_${i}` }));

  // Bijection constraints: each roommate gets 1 room and each room gets 1 roommate
  m1.constraint(x.map((row) => expr`${sum(row)} == 1`));
  m1.constraint(
    Array.from({ length: n }, (_, r) => expr`${sum(x.map((row) => row[r]))} == 1`)
  );
  // Maximize total roommate valuation (utilitarian welfare)
  m1.objective(
    maximize(
      sum(
        x.flatMap((row, i) =>
          row.map((v, r) => expr`${input.valuations[i][r]} * ${v}`)
        )
      )
    )
  );
  await m1.solve();

  // Round binary values to extract exact room indices
  const assignment = x.map((row) => row.findIndex((v) => Math.round(v.value!) === 1));
  const totalValuation = assignment.reduce(
    (acc, r, i) => acc + input.valuations[i][r],
    0
  );

  // Stage 2: LP to find envy-free rents maximizing minimum roommate surplus
  const m2 = new Model("ShareHouseStage2");
  // Non-negative rent per room; minSurplus is unbounded below in case totalRent exceeds valuations
  const rents = m2.continuous(n, { lb: 0, prefix: "rent" });
  const minSurplus = m2.continuous("minSurplus", { lb: -Infinity, ub: Infinity });

  // Budget balance: rents must sum to totalRent
  m2.constraint(expr`${sum(rents)} == ${input.totalRent}`, "total_rent");

  // Epigraph & envy-freeness: every roommate's assigned surplus >= minSurplus and >= any other room's surplus
  assignment.forEach((ri, i) => {
    m2.constraint(
      expr`${input.valuations[i][ri]} - ${rents[ri]} >= ${minSurplus}`,
      `surplus_${i}`
    );
    input.valuations[i].forEach((val, r) => {
      if (r !== ri) {
        m2.constraint(
          expr`${input.valuations[i][ri]} - ${rents[ri]} >= ${val} - ${rents[r]}`,
          `ef_${i}_${r}`
        );
      }
    });
  });

  // Maximize worst-case roommate surplus (egalitarian / max-min fairness)
  m2.objective(maximize(minSurplus));
  await m2.solve();

  return {
    assignment,
    rents: rents.map((v) => v.value! || 0),
    totalValuation,
    minSurplus: m2.objectiveValue!,
  };
}
