import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P066Input {
  supplies: number[][];
  demands: number[][];
  arrivalTimes: number[];
  dueTimes: number[];
  inDoorCaps: number[];
  outDoorCaps: number[];
  handlingCosts: number[][];
  transferTimes: number[][];
  delayCost: number;
}

export interface P066Output {
  inDoor: number[];
  outDoor: number[];
  flows: number[][][];
  departures: number[];
  totalCost: number;
}

export async function solve(input: P066Input): Promise<P066Output> {
  const nIn = input.supplies.length;
  const nOut = input.demands.length;
  const nComms = input.supplies[0]?.length ?? 0;
  const R = input.inDoorCaps.length;
  const S = input.outDoorCaps.length;

  const m = new Model("CrossDockingSync");

  const x = m.binary(nIn, R, { prefix: "x" });
  const y = m.binary(nOut, S, { prefix: "y" });
  const z = m.binary(nIn, nOut, { prefix: "z" });
  const f = Array.from({ length: nIn }, (_, i) =>
    Array.from({ length: nOut }, (__, j) =>
      m.continuous(nComms, { lb: 0, prefix: `f_${i}_${j}` })
    )
  );
  const w = Array.from({ length: nIn }, (_, i) =>
    Array.from({ length: nOut }, (__, j) =>
      m.continuous(R, S, { lb: 0, prefix: `w_${i}_${j}` })
    )
  );
  const dep = m.continuous(nOut, { lb: 0, prefix: "dep" });
  const tard = m.continuous(nOut, { lb: 0, prefix: "tard" });

  // Door assignment and capacities
  m.constraint(x.map((row) => expr`${sum(row)} == 1`));
  m.constraint(
    input.inDoorCaps.map(
      (cap, r) => expr`${sum(x.map((row) => row[r]))} <= ${cap}`
    )
  );
  m.constraint(y.map((row) => expr`${sum(row)} == 1`));
  m.constraint(
    input.outDoorCaps.map(
      (cap, s) => expr`${sum(y.map((row) => row[s]))} <= ${cap}`
    )
  );

  // Commodity supply & demand conservation
  for (let k = 0; k < nComms; k++) {
    m.constraint(
      input.supplies.map(
        (sup, i) => expr`${sum(f[i].map((row) => row[k]))} <= ${sup[k]}`
      )
    );
    m.constraint(
      input.demands.map(
        (dem, j) => expr`${sum(f.map((row) => row[j][k]))} == ${dem[k]}`
      )
    );
  }

  const maxArr = Math.max(...input.arrivalTimes);
  const maxTrans = Math.max(...input.transferTimes.flat());
  const bigMT = maxArr + maxTrans;

  for (let i = 0; i < nIn; i++) {
    for (let j = 0; j < nOut; j++) {
      let maxPairFlow = 0;
      for (let k = 0; k < nComms; k++) {
        maxPairFlow += Math.min(input.supplies[i][k], input.demands[j][k]);
      }
      const pairFlowSum = sum(f[i][j]);
      m.constraint(expr`${pairFlowSum} <= ${maxPairFlow} * ${z[i][j]}`);
      m.constraint(expr`${sum(w[i][j].flat())} - ${pairFlowSum} == 0`);

      for (let r = 0; r < R; r++) {
        m.constraint(expr`${sum(w[i][j][r])} <= ${maxPairFlow} * ${x[i][r]}`);
      }
      for (let s = 0; s < S; s++) {
        m.constraint(
          expr`${sum(w[i][j].map((row) => row[s]))} <= ${maxPairFlow} * ${y[j][s]}`
        );
      }

      for (let r = 0; r < R; r++) {
        for (let s = 0; s < S; s++) {
          const rhs = input.arrivalTimes[i] + input.transferTimes[r][s] - 3 * bigMT;
          m.constraint(
            expr`${dep[j]} - ${bigMT} * ${x[i][r]} - ${bigMT} * ${y[j][s]} - ${bigMT} * ${z[i][j]} >= ${rhs}`
          );
        }
      }
    }
  }

  m.constraint(
    input.dueTimes.map((due, j) => expr`${tard[j]} >= ${dep[j]} - ${due}`)
  );

  const handlingExpr = sum(
    w.flatMap((rowI) =>
      rowI.flatMap((mat) =>
        mat.flatMap((rowR, r) =>
          rowR.map((v, s) => expr`${input.handlingCosts[r][s]} * ${v}`)
        )
      )
    )
  );
  m.objective(
    minimize(expr`${handlingExpr} + ${input.delayCost} * ${sum(tard)}`)
  );
  await m.solve();

  return {
    inDoor: x.map((row) => row.findIndex((v) => Math.round(v.value!) === 1)),
    outDoor: y.map((row) => row.findIndex((v) => Math.round(v.value!) === 1)),
    flows: f.map((rowI) => rowI.map((rowJ) => rowJ.map((v) => v.value!))),
    departures: dep.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
