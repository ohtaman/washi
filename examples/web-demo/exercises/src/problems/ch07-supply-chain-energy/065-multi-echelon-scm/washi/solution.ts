import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P065Input {
  plantFixedCosts: number[];
  plantCaps: number[];
  dcFixedCosts: number[];
  dcCaps: number[];
  demands: number[];
  plantDcCosts: number[][];
  dcCustomerCosts: number[][];
}

export interface P065Output {
  openPlants: number[];
  openDcs: number[];
  plantToDc: number[][];
  dcToCustomer: number[][];
  totalCost: number;
}

export async function solve(input: P065Input): Promise<P065Output> {
  const nPlants = input.plantCaps.length;
  const nDcs = input.dcCaps.length;
  const nCusts = input.demands.length;
  const m = new Model("MultiEchelonSCM");

  const openPlants = m.binary(nPlants, { prefix: "plant" });
  const openDcs = m.binary(nDcs, { prefix: "dc" });
  const plantToDc = m.continuous(nPlants, nDcs, { lb: 0, prefix: "p2d" });
  const dcToCustomer = m.continuous(nDcs, nCusts, { lb: 0, prefix: "d2c" });

  // Plant capacity linking
  m.constraint(
    plantToDc.map((row, p) => expr`${sum(row)} <= ${input.plantCaps[p]} * ${openPlants[p]}`)
  );

  // DC throughput capacity linking and flow conservation
  input.dcCaps.forEach((cap, d) => {
    const dcInflow = sum(plantToDc.map((row) => row[d]));
    const dcOutflow = sum(dcToCustomer[d]);
    m.constraint(expr`${dcInflow} <= ${cap} * ${openDcs[d]}`);
    m.constraint(expr`${dcInflow} - ${dcOutflow} == 0`);
  });

  // Customer demand satisfaction
  m.constraint(
    input.demands.map(
      (demand, c) => expr`${sum(dcToCustomer.map((row) => row[c]))} >= ${demand}`
    )
  );

  const p2dExpr = sum(
    plantToDc.flatMap((row, p) =>
      row.map((flow, d) => expr`${input.plantDcCosts[p][d]} * ${flow}`)
    )
  );
  const d2cExpr = sum(
    dcToCustomer.flatMap((row, d) =>
      row.map((flow, c) => expr`${input.dcCustomerCosts[d][c]} * ${flow}`)
    )
  );
  m.objective(
    minimize(
      expr`dot(${input.plantFixedCosts}, ${openPlants}) + dot(${input.dcFixedCosts}, ${openDcs}) + ${p2dExpr} + ${d2cExpr}`
    )
  );
  await m.solve();

  return {
    openPlants: openPlants.map((v) => Math.round(v.value!) || 0),
    openDcs: openDcs.map((v) => Math.round(v.value!) || 0),
    plantToDc: plantToDc.map((row) => row.map((v) => v.value!)),
    dcToCustomer: dcToCustomer.map((row) => row.map((v) => v.value!)),
    totalCost: m.objectiveValue!,
  };
}
